// Keel "Fields": custom fields per board, stored in the Keel worker's D1 database
// (no 4 KB Trello limit). Every request carries the user's Trello token; the worker
// checks with Trello that the user can open the board/card before reading or writing.
import { CH_PROXY_URL } from '../config.js';
import { getSettings, get, set } from './storage.js';
import { getToken } from './trello-api.js';
import { el, formatDate, deadlineColor, truncate, uid } from './util.js';

// --- Types ------------------------------------------------------------------
// "section" and "header" are layout-only: they hold no value.
export const TYPES = {
  text: { label: 'Text', icon: 'Aa', hint: 'One line, e.g. a reference or company number' },
  notes: { label: 'Multi-line text', icon: '¶', hint: 'Notes. Lines starting with "- " become bullets; a short line ending in ":" becomes a heading' },
  number: { label: 'Number', icon: '#', hint: 'Plain, money (£ € $) or percentage' },
  date: { label: 'Date', icon: '31', hint: 'With deadline colours on the card front' },
  choice: { label: 'Choice', icon: '◉', hint: 'Pick one option: buttons or a dropdown' },
  multi: { label: 'Coloured chips', icon: '◆', hint: 'Pick several options, each with a colour' },
  checkbox: { label: 'Checkbox', icon: '✓', hint: 'Yes / no' },
  rating: { label: 'Rating', icon: '★', hint: 'Stars, 3 to 10' },
  progress: { label: 'Progress bar', icon: '▰', hint: '0–100 %' },
  url: { label: 'Link', icon: '↗', hint: 'A web address, opened in a new tab' },
  email: { label: 'Email', icon: '@', hint: 'Click to send an email' },
  phone: { label: 'Phone', icon: '☎', hint: 'Click to call' },
  section: { label: 'Section tab', icon: '▤', hint: 'Groups the fields below it into a tab on the card' },
  header: { label: 'Heading', icon: 'H', hint: 'A coloured heading between fields' }
};
export const LAYOUT_TYPES = ['section', 'header'];
export const COLORS = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'light-gray'];
export const NUMBER_FORMATS = { plain: 'Plain number', gbp: 'Pounds (£)', eur: 'Euros (€)', usd: 'Dollars ($)', percent: 'Percentage (%)' };
export const WIDTHS = { full: 'Full width', half: '1/2 width', third: '1/3 width' };

export function isLayout(field) {
  return LAYOUT_TYPES.includes(field.type);
}

export function newId() {
  return `f${uid()}`;
}

const opt = (label, color) => ({ id: newId(), label, color });

/**
 * Field gallery: ready-made fields grouped like a catalogue. `make()` returns a new
 * field definition; `sample` is the value shown in the gallery preview.
 */
export const TEMPLATES = [
  // Basic
  { group: 'Basic', name: 'Text', desc: 'Single line of text', make: () => ({ type: 'text', name: 'Text' }), sample: 'Meet next week' },
  { group: 'Basic', name: 'Multi-line text', desc: 'Notes with headings and bullet points', make: () => ({ type: 'notes', name: 'Notes', placeholder: 'Heading:\n- first point' }), sample: 'Debtors:\n- August sales missing' },
  { group: 'Basic', name: 'Checkbox', desc: 'Tick on or off', make: () => ({ type: 'checkbox', name: 'Checkbox' }), sample: true },
  { group: 'Basic', name: 'Dropdown', desc: 'Pick one option from a list', make: () => ({ type: 'choice', display: 'dropdown', name: 'Dropdown', options: [opt('Option 1', 'blue'), opt('Option 2', 'green')] }), sample: 0 },
  { group: 'Basic', name: 'Segment buttons', desc: 'Buttons side by side to pick one option', make: () => ({ type: 'choice', display: 'buttons', name: 'Segment', options: [opt('Option A', 'green'), opt('Option B', 'orange')] }), sample: 0 },
  { group: 'Basic', name: 'Coloured chips', desc: 'Pick several options, each with a colour', make: () => ({ type: 'multi', name: 'Chips', options: [opt('Option A', 'blue'), opt('Option B', 'yellow'), opt('Option C', 'pink')] }), sample: [0, 1] },
  { group: 'Basic', name: 'Number', desc: 'Numbers, money or percentages', make: () => ({ type: 'number', name: 'Number', format: 'plain', decimals: 0 }), sample: 42 },
  { group: 'Basic', name: 'Date', desc: 'A date with deadline colours', make: () => ({ type: 'date', name: 'Date', deadline: true }), sample: 'soon' },
  { group: 'Basic', name: 'Progress bar', desc: 'How far along something is', make: () => ({ type: 'progress', name: 'Progress' }), sample: 65 },
  { group: 'Basic', name: 'Rating', desc: 'Star rating', make: () => ({ type: 'rating', name: 'Rating', max: 5 }), sample: 4 },
  { group: 'Basic', name: 'Link', desc: 'Clickable web address', make: () => ({ type: 'url', name: 'Link', placeholder: 'https://' }), sample: 'https://example.com' },
  { group: 'Basic', name: 'Email', desc: 'Click to send an email', make: () => ({ type: 'email', name: 'Email' }), sample: 'hello@example.com' },
  { group: 'Basic', name: 'Phone', desc: 'Click to call', make: () => ({ type: 'phone', name: 'Phone' }), sample: '020 7946 0000' },
  // Practice examples
  { group: 'Examples', name: 'VAT status', desc: 'VAT / Non-VAT buttons', make: () => ({ type: 'choice', display: 'buttons', name: 'VAT Status', badge: true, options: [opt('VAT', 'green'), opt('Non-VAT', 'light-gray')] }), sample: 0 },
  { group: 'Examples', name: 'Company number', desc: 'Companies House number', make: () => ({ type: 'text', name: 'Company Number', placeholder: '01234567', width: 'third' }), sample: '01234567' },
  { group: 'Examples', name: 'UTR', desc: 'Unique taxpayer reference', make: () => ({ type: 'text', name: 'UTR', placeholder: '10 digits', width: 'third' }), sample: '1234567890' },
  { group: 'Examples', name: 'Status', desc: 'Where the job is, with colours', make: () => ({ type: 'choice', display: 'dropdown', name: 'Status', badge: true, options: [opt('Not started', 'light-gray'), opt('In progress', 'blue'), opt('Waiting on client', 'orange'), opt('Done', 'green')] }), sample: 1 },
  { group: 'Examples', name: 'Priority', desc: 'Low / Medium / High / Critical', make: () => ({ type: 'choice', display: 'buttons', name: 'Priority', options: [opt('Low', 'light-gray'), opt('Medium', 'yellow'), opt('High', 'orange'), opt('Critical', 'red')] }), sample: 2 },
  { group: 'Examples', name: 'Deadline', desc: 'Turns orange, then red as it nears', make: () => ({ type: 'date', name: 'Deadline', deadline: true, badge: true, badgeName: true }), sample: 'soon' },
  { group: 'Examples', name: 'Year end', desc: 'Accounting year end', make: () => ({ type: 'date', name: 'Year end', deadline: false, width: 'third' }), sample: 'soon' },
  { group: 'Examples', name: 'Fee', desc: 'Money in pounds', make: () => ({ type: 'number', name: 'Fee', format: 'gbp', decimals: 2, width: 'third' }), sample: 1500 },
  { group: 'Examples', name: 'Percentage', desc: 'Number shown with %', make: () => ({ type: 'number', name: 'Percentage', format: 'percent', decimals: 0, width: 'third' }), sample: 72 },
  { group: 'Examples', name: 'Services', desc: 'What you do for the client', make: () => ({ type: 'multi', name: 'Services', options: [opt('Bookkeeping', 'green'), opt('Accounts', 'blue'), opt('VAT', 'purple'), opt('Payroll', 'orange'), opt('Self assessment', 'sky')] }), sample: [0, 2] },
  { group: 'Examples', name: 'Things to check', desc: 'Schedule notes with headings and bullets', make: () => ({ type: 'notes', name: 'Things to check', placeholder: 'Debtors:\n- August sales missing' }), sample: 'Creditors:\n- Accruals reversal?' },
  { group: 'Examples', name: 'Required text', desc: 'Turns red while empty', make: () => ({ type: 'text', name: 'Required text', required: true }), sample: '' },
  // Layout
  { group: 'Layout', name: 'Section tab', desc: 'Group the fields below it into a tab', make: () => ({ type: 'section', name: 'Section' }), sample: null },
  { group: 'Layout', name: 'Heading', desc: 'A coloured heading between fields', make: () => ({ type: 'header', name: 'Heading', color: 'blue' }), sample: null }
];

/** A complete new field definition from a template. */
export function fromTemplate(tpl) {
  const base = tpl.make();
  if (isLayout(base)) return { id: newId(), color: '', ...base };
  return { id: newId(), shown: true, badge: false, badgeName: false, required: false, help: '', placeholder: '', width: 'full', label: 'top', color: '', ...base };
}

/** The gallery preview value of a template, resolved against the field it makes. */
export function sampleValue(tpl, field) {
  const s = tpl.sample;
  if (field.type === 'choice') return field.options[s] ? field.options[s].id : null;
  if (field.type === 'multi') return (s || []).map((i) => field.options[i] && field.options[i].id).filter(Boolean);
  if (field.type === 'date') return new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  return s;
}

// --- API ----------------------------------------------------------------------

export class NeedsAuthError extends Error {
  constructor() { super('Authorise Keel to use Fields: Power-Up settings → Authorise.'); this.name = 'NeedsAuthError'; }
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
  saveViews: (t, boardId, views) => request(t, 'PUT', `/board/${boardId}/views`, { views }),
  card: (t, cardId) => request(t, 'GET', `/card/${cardId}`),
  patchCard: (t, cardId, patch) => request(t, 'PATCH', `/card/${cardId}`, patch),
  sample: (t, boardId, body) => request(t, 'POST', `/board/${boardId}/sample`, body)
};

// --- Values -------------------------------------------------------------------

export function isEmpty(value) {
  return value === null || value === undefined || value === '' || value === false || (Array.isArray(value) && !value.length);
}

/** Value fields shown on a card: its own list if set, else the fields marked "show on cards". */
export function visibleFields(fields, visible) {
  const valueFields = fields.filter((f) => !isLayout(f));
  if (Array.isArray(visible)) {
    const set = new Set(visible);
    return valueFields.filter((f) => set.has(f.id));
  }
  return valueFields.filter((f) => f.shown !== false);
}

export function optionOf(field, value) {
  return (field.options || []).find((o) => o.id === value) || null;
}

export function formatNumber(field, value) {
  if (typeof value !== 'number') return String(value ?? '');
  const d = Number.isInteger(field.decimals) ? field.decimals : 2;
  const fmt = field.format || 'plain';
  if (fmt === 'percent') return `${new Intl.NumberFormat('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(value)}%`;
  if (fmt === 'gbp' || fmt === 'eur' || fmt === 'usd') {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: fmt.toUpperCase(), minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
  }
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: d }).format(value);
}

export function stars(field, value) {
  const max = field.max || 5;
  const n = Math.max(0, Math.min(max, Number(value) || 0));
  return '★'.repeat(n) + '☆'.repeat(max - n);
}

export function bar(value, cells = 10) {
  const n = Math.round((Math.max(0, Math.min(100, Number(value) || 0)) / 100) * cells);
  return '▰'.repeat(n) + '▱'.repeat(cells - n);
}

function notesSummary(text) {
  return String(text).split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean).join(' · ');
}

/** Plain-text rendering of a value (table cells, CSV, badges, search). */
export function formatValue(field, value, { short = false } = {}) {
  if (isEmpty(value) && field.type !== 'checkbox') return '';
  switch (field.type) {
    case 'choice': { const o = optionOf(field, value); return o ? o.label : ''; }
    case 'multi': return (Array.isArray(value) ? value : []).map((v) => optionOf(field, v)).filter(Boolean).map((o) => o.label).join(', ');
    case 'checkbox': return value ? 'Yes' : '';
    case 'number': return formatNumber(field, value);
    case 'rating': return short ? stars(field, value) : `${value}/${field.max || 5}`;
    case 'progress': return `${value}%`;
    case 'date': return formatDate(value, short ? { year: undefined } : {});
    case 'notes': return short ? truncate(notesSummary(value), 60) : String(value);
    case 'url': return short ? String(value).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : String(value);
    default: return String(value);
  }
}

/** Card-front badges for the visible fields that have "Show value on card front" on. */
export function badgesFor(fields, card) {
  const values = (card && card.values) || {};
  const out = [];
  for (const f of visibleFields(fields, card ? card.visible : null)) {
    if (!f.badge) continue;
    const value = values[f.id];
    const named = (text) => (f.badgeName ? `${f.name}: ${text}` : text);
    if (isEmpty(value)) {
      if (f.required) out.push({ text: `${f.name}: missing`, color: 'red' });
      continue;
    }
    switch (f.type) {
      case 'choice': { const o = optionOf(f, value); if (o) out.push({ text: named(o.label), color: o.color }); break; }
      case 'multi': {
        const opts = value.map((v) => optionOf(f, v)).filter(Boolean);
        if (f.badgeName && opts.length) out.push({ text: named(opts.map((o) => o.label).join(', ')), color: opts[0].color });
        else opts.forEach((o) => out.push({ text: o.label, color: o.color }));
        break;
      }
      case 'checkbox': out.push({ text: `✓ ${f.name}`, color: 'green' }); break;
      case 'date': {
        const text = named(formatValue(f, value, { short: true }));
        out.push(f.deadline === false ? { text } : { text, color: deadlineColor(value) });
        break;
      }
      case 'rating': out.push({ text: named(stars(f, value)), color: 'yellow' }); break;
      case 'progress': out.push({ text: named(`${bar(value, 5)} ${value}%`), color: value >= 100 ? 'green' : undefined }); break;
      case 'notes': break;
      default: out.push({ text: named(truncate(formatValue(f, value, { short: true }), 24)) });
    }
  }
  return out;
}

/**
 * Render notes text: "- " / "* " / "• " / "1." lines become bullets, other lines paragraphs;
 * a short line ending in ":" or followed by bullets becomes a heading; **bold** is supported.
 */
export function renderNotes(text) {
  const root = el('div', { class: 'notes' });
  const lines = String(text || '').split('\n');
  let list = null;
  const inline = (s) => {
    const parts = String(s).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return parts.map((p) => (/^\*\*[^*]+\*\*$/.test(p) ? el('strong', {}, p.slice(2, -2)) : p));
  };
  lines.forEach((line, i) => {
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      if (!list) { list = el('ul'); root.append(list); }
      list.append(el('li', {}, ...inline(bullet[1])));
      return;
    }
    list = null;
    if (!line.trim()) return;
    const next = lines[i + 1] || '';
    const heading = line.trim().length <= 60 && (/:\s*$/.test(line) || /^\s*(?:[-*•]|\d+[.)])\s+/.test(next) || /^#+\s/.test(line));
    root.append(el(heading ? 'h4' : 'p', {}, ...inline(line.trim().replace(/^#+\s*/, ''))));
  });
  return root;
}

/** CSV cell with protection against spreadsheet formula injection. */
export function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

// --- Change markers ---------------------------------------------------------------
// Badges are drawn by the connector iframe from a cached copy of the board's data.
// After a change, Keel bumps a tiny pluginData marker so Trello redraws the badges
// and the connector knows its copy is stale.
export const REV_KEY = 'fieldsRev';

export function markCardChanged(t, cardId = 'card') {
  return set(t, cardId, REV_KEY, Date.now()).catch(() => {});
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
