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

const CH_BASE = 'https://api.company-information.service.gov.uk';
const CACHE_SECONDS = 3600;

function corsHeaders(env, request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const allowOrigin = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0] || '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
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

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(env, request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, cors);

    const url = new URL(request.url);
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
