// Keel "Fields": custom fields per board, stored in the Keel worker's D1 database
// (no 4 KB Trello limit). Every request carries the user's Trello token; the worker
// checks with Trello that the user can open the board/card before reading or writing.
import { CH_PROXY_URL } from '../config.js';
import { getSettings, get, set } from './storage.js';
import { getToken } from './trello-api.js';
import { el, formatDate, deadlineColor, truncate, uid } from './util.js';

export const TYPES = {
  text: { label: 'Text', hint: 'One line, e.g. a reference' },
  notes: { label: 'Notes', hint: 'Several lines; a line starting with "- " is a bullet' },
  number: { label: 'Number', hint: 'e.g. a fee or amount' },
  date: { label: 'Date', hint: 'Shown with a deadline colour' },
  choice: { label: 'Choice', hint: 'Buttons to pick one option, e.g. VAT / Non-VAT' },
  checkbox: { label: 'Checkbox', hint: 'Yes / no' }
};
export const COLORS = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'light-gray'];

// pluginData markers that tell other Keel iframes (badges) that field data changed.
export const REV_KEY = 'fieldsRev';

export class NeedsAuthError extends Error {
  constructor() { super('Authorise Keel to use Fields: Power-Up settings → Authorise.'); this.name = 'NeedsAuthError'; }
}

export function newId() {
  return `f${uid()}`;
}

async function baseUrl(t) {
  const settings = await getSettings(t);
  return (settings.chProxyUrl || CH_PROXY_URL).replace(/\/+$/, '');
}

async function request(t, method, path, body) {
  const token = await getToken(t);
  if (!token) throw new NeedsAuthError();
  const res = await fetch(`${await baseUrl(t)}/fields${path}`, {
    method,
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 404 && !data.error) throw new Error('The Keel worker does not have Fields yet: redeploy worker/ (README step 6).');
  if (!res.ok) throw new Error(data.error || `Fields request failed (${res.status})`);
  return data;
}

export const api = {
  board: (t, boardId) => request(t, 'GET', `/board/${boardId}`),
  saveFields: (t, boardId, fields, updatedAt) => request(t, 'PUT', `/board/${boardId}`, { fields, updatedAt }),
  card: (t, cardId) => request(t, 'GET', `/card/${cardId}`),
  patchCard: (t, cardId, patch) => request(t, 'PATCH', `/card/${cardId}`, patch),
  sample: (t, boardId, body) => request(t, 'POST', `/board/${boardId}/sample`, body)
};

/** Fields shown on a card: its own list if set, else the fields marked "show on cards". */
export function visibleFields(fields, visible) {
  if (Array.isArray(visible)) {
    const set = new Set(visible);
    return fields.filter((f) => set.has(f.id));
  }
  return fields.filter((f) => f.shown !== false);
}

export function optionOf(field, value) {
  return (field.options || []).find((o) => o.id === value) || null;
}

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

/** Plain-text rendering of a value (table cells, CSV, badges). */
export function formatValue(field, value, { short = false } = {}) {
  if (value === null || value === undefined || value === '') return '';
  switch (field.type) {
    case 'choice': { const o = optionOf(field, value); return o ? o.label : ''; }
    case 'checkbox': return value ? 'Yes' : '';
    case 'number': return typeof value === 'number' ? numberFormat.format(value) : String(value);
    case 'date': return formatDate(value, short ? { year: undefined } : {});
    case 'notes': return short ? truncate(String(value).split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean).join(' · '), 60) : String(value);
    default: return String(value);
  }
}

/** Card-front badges for the visible fields that have "badge" switched on. */
export function badgesFor(fields, card) {
  if (!card) return [];
  const out = [];
  for (const f of visibleFields(fields, card.visible)) {
    const value = card.values ? card.values[f.id] : undefined;
    if (!f.badge || value === undefined || value === null || value === '') continue;
    if (f.type === 'choice') {
      const o = optionOf(f, value);
      if (o) out.push({ text: o.label, color: o.color === 'light-gray' ? 'light-gray' : o.color });
    } else if (f.type === 'checkbox') {
      if (value) out.push({ text: `✓ ${f.name}`, color: 'green' });
    } else if (f.type === 'date') {
      out.push({ text: `${f.name}: ${formatValue(f, value, { short: true })}`, color: deadlineColor(value) });
    } else if (f.type !== 'notes') {
      out.push({ text: `${f.name}: ${truncate(formatValue(f, value), 24)}` });
    }
  }
  return out;
}

/**
 * Render notes text: "- " / "* " / "• " lines become bullets, other lines paragraphs,
 * a short line ending in ":" or followed by bullets becomes a heading.
 */
export function renderNotes(text) {
  const root = el('div', { class: 'notes' });
  const lines = String(text || '').split('\n');
  let list = null;
  lines.forEach((line, i) => {
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      if (!list) { list = el('ul'); root.append(list); }
      list.append(el('li', {}, bullet[1]));
      return;
    }
    list = null;
    if (!line.trim()) return;
    const next = lines[i + 1] || '';
    const heading = line.trim().length <= 60 && (/:\s*$/.test(line) || /^\s*(?:[-*•]|\d+[.)])\s+/.test(next));
    root.append(el(heading ? 'h4' : 'p', {}, line.trim()));
  });
  return root;
}

/** CSV cell with protection against spreadsheet formula injection. */
export function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

// --- Change markers ---------------------------------------------------------
// Badges are drawn by the connector iframe from a cached copy of the board's data.
// After a change, Keel bumps a tiny pluginData marker so Trello redraws the badges
// and the connector knows its copy is stale.
export function markCardChanged(t) {
  return set(t, 'card', REV_KEY, Date.now()).catch(() => {});
}
export function markBoardChanged(t) {
  return set(t, 'board', REV_KEY, Date.now()).catch(() => {});
}

let boardCache = null; // { boardId, at, promise }
const BOARD_TTL_MS = 60 * 1000;

/** Board data for badges, shared by every card on the board and refreshed when stale. */
export async function cachedBoard(t, boardId) {
  const [boardRev, cardRev] = await Promise.all([get(t, 'board', REV_KEY, 0), get(t, 'card', REV_KEY, 0)]);
  const c = boardCache;
  const fresh = c && c.boardId === boardId && Date.now() - c.at < BOARD_TTL_MS && boardRev <= c.at && cardRev <= c.at;
  if (!fresh) {
    const at = Date.now();
    boardCache = { boardId, at, promise: api.board(t, boardId).catch((err) => { console.warn('Keel fields unavailable', err.message); return null; }) };
  }
  return boardCache.promise;
}
