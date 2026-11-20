// Cloudflare Worker: Companies House proxy for the Trello Power-Up.
//
// Why a proxy? The Companies House API needs your secret API key and does not
// allow browser (CORS) requests, so the Power-Up iframe cannot call it directly.
// This worker keeps the key server-side, adds CORS headers for your Power-Up's
// origin, trims the response to what the Power-Up needs and caches it for an hour.
//
// Routes:
//   GET /company/:number   -> profile + filing deadlines + active officers
//   GET /search?q=name     -> up to 10 matching companies (number, name, status, address)
//   GET /health            -> "ok"
//   /fields/...            -> Keel "Fields" storage in D1 (see handleFields below);
//                             every call needs the user's Trello token and is checked
//                             against Trello before any data is read or written.

import { sanitizeFields, sanitizeCardPatch, mergeValues, isTrelloId, ValidationError, LIMITS } from './fields.js';

const CH_BASE = 'https://api.company-information.service.gov.uk';
const TRELLO_BASE = 'https://api.trello.com/1';
const CACHE_SECONDS = 3600;

function corsHeaders(env, request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const allowOrigin = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0] || '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, PUT, PATCH, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders } });
}

async function chFetch(env, path) {
  const auth = btoa(`${env.CH_API_KEY}:`);
  return fetch(`${CH_BASE}${path}`, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } });
}

function formatAddress(a) {
  if (!a) return '';
  return [a.premises, a.address_line_1, a.address_line_2, a.locality, a.region, a.postal_code].filter(Boolean).join(', ');
}

export function shapeCompany(profile, officers) {
  const accounts = profile.accounts || {};
  const cs = profile.confirmation_statement || {};
  const ard = accounts.accounting_reference_date;
  return {
    number: profile.company_number,
    name: profile.company_name,
    status: profile.company_status,
    type: profile.type,
    incorporated: profile.date_of_creation || null,
    address: formatAddress(profile.registered_office_address),
    sic: profile.sic_codes || [],
    accounts: {
      nextDue: accounts.next_due || null,
      nextMadeUpTo: accounts.next_made_up_to || null,
      overdue: !!accounts.overdue,
      lastMadeUpTo: accounts.last_accounts ? accounts.last_accounts.made_up_to || null : null,
      ard: ard ? `${String(ard.day).padStart(2, '0')}/${String(ard.month).padStart(2, '0')}` : null
    },
    confirmation: {
      nextDue: cs.next_due || null,
      nextMadeUpTo: cs.next_made_up_to || null,
      overdue: !!cs.overdue,
      lastMadeUpTo: cs.last_made_up_to || null
    },
    officers: (officers && officers.items ? officers.items : [])
      .filter((o) => !o.resigned_on)
      .map((o) => ({ name: o.name, role: (o.officer_role || '').replace(/-/g, ' '), appointed: o.appointed_on || null }))
  };
}

export function shapeSearch(data) {
  return (data && Array.isArray(data.items) ? data.items : [])
    .filter((i) => i && i.company_number)
    .map((i) => ({
      number: i.company_number,
      name: i.title || i.company_number,
      status: i.company_status || null,
      type: i.company_type || null,
      incorporated: i.date_of_creation || null,
      ceased: i.date_of_cessation || null,
      address: i.address_snippet || formatAddress(i.address)
    }));
}

/** Map a failed Companies House response to the error the Power-Up shows. */
function chError(res, cors) {
  if (res.status === 401) return json({ error: 'Companies House rejected the API key' }, 502, cors);
  if (res.status === 429) return json({ error: 'Companies House rate limit reached, try again shortly' }, 429, cors);
  return json({ error: `Companies House error ${res.status}` }, 502, cors);
}

async function fromCache(cacheKey, cors) {
  const cached = await caches.default.match(cacheKey);
  if (!cached) return null;
  const res = new Response(cached.body, cached);
  Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
  res.headers.set('X-Cache', 'HIT');
  return res;
}

function cachedJson(body, cors, cacheKey, ctx) {
  const res = json(body, 200, { ...cors, 'Cache-Control': `public, max-age=${CACHE_SECONDS}`, 'X-Cache': 'MISS' });
  ctx.waitUntil(caches.default.put(cacheKey, res.clone()));
  return res;
}

async function handleSearch(url, env, ctx, cors) {
  const q = (url.searchParams.get('q') || '').trim().replace(/\s+/g, ' ');
  if (q.length < 2) return json({ error: 'Type at least 2 characters of the company name' }, 400, cors);
  if (q.length > 100) return json({ error: 'Search text is too long' }, 400, cors);

  const cacheKey = new Request(`${url.origin}/search?q=${encodeURIComponent(q.toLowerCase())}`, { method: 'GET' });
  const hit = await fromCache(cacheKey, cors);
  if (hit) return hit;

  const res = await chFetch(env, `/search/companies?q=${encodeURIComponent(q)}&items_per_page=10`);
  if (res.status === 404) return json({ items: [] }, 200, cors);
  if (!res.ok) return chError(res, cors);
  return cachedJson({ items: shapeSearch(await res.json()) }, cors, cacheKey, ctx);
}

// --- Fields storage --------------------------------------------------------

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Successful Trello access checks, cached briefly per isolate: sha256(token):kind:id -> { boardId, exp }.
const accessCache = new Map();
const ACCESS_TTL_MS = 5 * 60 * 1000;

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bearerToken(request) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+([^\s]{10,4096})$/);
  if (!m) throw new HttpError(401, 'Authorise Keel first: Power-Up settings → Authorise');
  return m[1];
}

/** Ask Trello whether this token can open the card/board. Returns { boardId }. */
async function verifyAccess(token, kind, id) {
  if (!isTrelloId(id)) throw new HttpError(400, 'Invalid id');
  const key = `${await sha256(token)}:${kind}:${id}`;
  const hit = accessCache.get(key);
  if (hit && hit.exp > Date.now()) return hit;
  const path = kind === 'card' ? `/cards/${id}?fields=idBoard` : `/boards/${id}?fields=id`;
  const res = await fetch(`${TRELLO_BASE}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if ([400, 401, 403, 404].includes(res.status)) throw new HttpError(403, 'Trello did not allow access: authorise Keel again (Power-Up settings → Authorise), or check you can open this card');
  if (!res.ok) throw new HttpError(502, `Could not check access with Trello (${res.status}), try again shortly`);
  const body = await res.json();
  const boardId = kind === 'card' ? body.idBoard : body.id;
  if (!isTrelloId(boardId)) throw new HttpError(502, 'Unexpected reply from Trello');
  const entry = { boardId, exp: Date.now() + ACCESS_TTL_MS };
  if (accessCache.size > 5000) accessCache.clear();
  accessCache.set(key, entry);
  return entry;
}

async function readJson(request, maxBytes) {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Too much data in one save');
  try { return JSON.parse(text || '{}'); } catch { throw new HttpError(400, 'Invalid JSON'); }
}

function parseJson(text, fallback) {
  try { return text ? JSON.parse(text) : fallback; } catch { return fallback; }
}

async function loadBoard(env, boardId) {
  const row = await env.DB.prepare('SELECT defs, updated_at FROM boards WHERE board_id = ?1').bind(boardId).first();
  return { fields: row ? parseJson(row.defs, []) : [], updatedAt: row ? row.updated_at : 0 };
}

async function loadCard(env, cardId) {
  const row = await env.DB.prepare('SELECT vals, visible, updated_at FROM cards WHERE card_id = ?1').bind(cardId).first();
  return { values: row ? parseJson(row.vals, {}) : {}, visible: row ? parseJson(row.visible, null) : null, updatedAt: row ? row.updated_at : 0 };
}

/**
 * GET   /fields/board/:boardId          -> { fields, updatedAt, cards: { cardId: { values, visible } } }
 * PUT   /fields/board/:boardId          <- { fields, updatedAt }  (updatedAt = the version you edited; 409 if it changed)
 * POST  /fields/board/:boardId/sample   <- any JSON (other Power-Ups' data, kept for setting up an import)
 * GET   /fields/card/:cardId            -> { boardId, fields, values, visible }
 * PATCH /fields/card/:cardId            <- { values?: { fieldId: value|null }, visible?: [fieldId]|null }
 */
async function handleFields(request, url, env) {
  if (!env.DB) throw new HttpError(500, 'Fields storage (D1 binding DB) is not configured on the worker');
  const m = url.pathname.match(/^\/fields\/(board|card)\/([^/]+)(\/sample)?\/?$/);
  if (!m) throw new HttpError(404, 'Unknown fields route');
  const [, kind, id, sample] = m;
  const token = bearerToken(request);
  const { boardId } = await verifyAccess(token, kind, id);
  const method = request.method;

  if (kind === 'board' && sample) {
    if (method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const body = await readJson(request, 900000);
    await env.DB.prepare('INSERT INTO import_samples (board_id, created_at, body) VALUES (?1, ?2, ?3)').bind(boardId, Date.now(), JSON.stringify(body)).run();
    return { ok: true };
  }

  if (kind === 'board') {
    if (method === 'GET') {
      const board = await loadBoard(env, boardId);
      const rows = await env.DB.prepare('SELECT card_id, vals, visible FROM cards WHERE board_id = ?1').bind(boardId).all();
      const cards = {};
      for (const r of rows.results || []) cards[r.card_id] = { values: parseJson(r.vals, {}), visible: parseJson(r.visible, null) };
      return { ...board, cards };
    }
    if (method === 'PUT') {
      const body = await readJson(request, 200000);
      const fields = sanitizeFields(body.fields);
      const now = Date.now();
      const base = Number(body.updatedAt) || 0;
      const res = await env.DB.prepare(
        `INSERT INTO boards (board_id, defs, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(board_id) DO UPDATE SET defs = excluded.defs, updated_at = excluded.updated_at WHERE boards.updated_at = ?4`
      ).bind(boardId, JSON.stringify(fields), now, base).run();
      if (!res.meta || !res.meta.changes) throw new HttpError(409, 'Someone else changed the fields since you opened this. Reload and make your changes again.');
      return { fields, updatedAt: now };
    }
    throw new HttpError(405, 'Method not allowed');
  }

  // kind === 'card'
  if (method === 'GET') {
    const [board, card] = await Promise.all([loadBoard(env, boardId), loadCard(env, id)]);
    return { boardId, fields: board.fields, fieldsUpdatedAt: board.updatedAt, values: card.values, visible: card.visible };
  }
  if (method === 'PATCH') {
    const body = await readJson(request, LIMITS.card + 20000);
    const board = await loadBoard(env, boardId);
    const patch = sanitizeCardPatch(board.fields, body);
    const current = await loadCard(env, id);
    const merged = mergeValues(current.values, patch.values);
    if (JSON.stringify(merged).length > LIMITS.card) throw new HttpError(413, 'This card has too much field data; shorten some notes');
    const visibleJson = patch.hasVisible && patch.visible ? JSON.stringify(patch.visible) : null;
    // json_patch merges only the changed fields, so two people editing different fields do not overwrite each other.
    await env.DB.prepare(
      `INSERT INTO cards (card_id, board_id, vals, visible, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(card_id) DO UPDATE SET board_id = excluded.board_id, vals = json_patch(cards.vals, ?6),
         visible = CASE WHEN ?7 = 1 THEN excluded.visible ELSE cards.visible END, updated_at = excluded.updated_at`
    ).bind(id, boardId, JSON.stringify(merged), visibleJson, Date.now(), JSON.stringify(patch.values), patch.hasVisible ? 1 : 0).run();
    const card = await loadCard(env, id);
    return { boardId, values: card.values, visible: card.visible };
  }
  throw new HttpError(405, 'Method not allowed');
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(env, request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (url.pathname.startsWith('/fields/')) {
      try {
        return json(await handleFields(request, url, env), 200, { ...cors, 'Cache-Control': 'no-store' });
      } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400, cors);
        if (err instanceof HttpError) return json({ error: err.message }, err.status, cors);
        console.error('fields error', err);
        return json({ error: 'Fields storage error, try again' }, 500, cors);
      }
    }
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, cors);

    if (url.pathname === '/health') return new Response('ok', { headers: cors });

    const isSearch = /^\/search\/?$/.test(url.pathname);
    const match = url.pathname.match(/^\/company\/([A-Za-z0-9]{1,10})\/?$/);
    if (!match && !isSearch) return json({ error: 'Use /company/{companyNumber} or /search?q={name}' }, 404, cors);
    if (!env.CH_API_KEY) return json({ error: 'CH_API_KEY secret is not configured on the worker' }, 500, cors);
    if (isSearch) return handleSearch(url, env, ctx, cors);

    let number = match[1].toUpperCase();
    if (/^\d+$/.test(number)) number = number.padStart(8, '0');

    const cacheKey = new Request(`${url.origin}/company/${number}`, { method: 'GET' });
    const hit = await fromCache(cacheKey, cors);
    if (hit) return hit;

    const profileRes = await chFetch(env, `/company/${number}`);
    if (profileRes.status === 404) return json({ error: 'Company not found' }, 404, cors);
    if (!profileRes.ok) return chError(profileRes, cors);
    const profile = await profileRes.json();

    let officers = null;
    try {
      const officersRes = await chFetch(env, `/company/${number}/officers?items_per_page=35`);
      if (officersRes.ok) officers = await officersRes.json();
    } catch (err) {
      // Officers are optional; keep going with the profile only.
    }

    return cachedJson(shapeCompany(profile, officers), cors, cacheKey, ctx);
  }
};
