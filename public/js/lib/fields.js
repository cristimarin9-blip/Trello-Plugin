// Keel "Fields": custom fields per board, stored in the Keel worker's D1 database
// (no 4 KB Trello limit). Every request carries the user's Trello token; the worker
// checks with Trello that the user can open the board/card before reading or writing.
import { CH_PROXY_URL } from '../config.js';
import { getSettings, get, set } from './storage.js';
import { getToken, api as trelloApi } from './trello-api.js';
import { el, deadlineColor, truncate, uid } from './util.js';
import { PROGRESS_STYLES, RATING_STYLES, TOGGLE_STYLES, NUMBER_FORMATS, DATE_FORMATS, DURATION_FORMATS, progressText, ratingText, formatNumberValue, scaleColor, formatDateValue, dateKind, toDate, dayOf, dateColor, formatDuration } from './field-styles.js';

// --- Types ------------------------------------------------------------------
// "section" and "header" are layout-only; "checklist", "cardid" and "carddate" are
// worked out from the card itself. None of these hold a stored value.
export const TYPES = {
  text: { label: 'Text', icon: 'Aa', hint: 'One line, e.g. a reference or company number' },
  notes: { label: 'Multi-line text', icon: '¶', hint: 'Notes. Lines starting with "- " become bullets; a short line ending in ":" becomes a heading; **bold**' },
  number: { label: 'Number', icon: '#', hint: 'Standard, money in any currency, accounting, percentages, scientific' },
  date: { label: 'Date / time', icon: '31', hint: 'Dates, times or both, in 29 formats, with deadline colours' },
  choice: { label: 'Choice', icon: '◉', hint: 'Pick one option: segment buttons or a dropdown' },
  multi: { label: 'Coloured chips', icon: '◆', hint: 'Pick several options, each with a colour' },
  checkbox: { label: 'Toggle', icon: '✓', hint: 'On / off, in 15 styles (checkbox, switch, star, thumbs, lock…)' },
  rating: { label: 'Rating', icon: '★', hint: '3 to 10 stars, hearts, circles, emoji…' },
  progress: { label: 'Progress bar', icon: '▰', hint: '0–100 %, in 15 bar styles' },
  duration: { label: 'Duration', icon: '⏱', hint: 'Time spent, e.g. 01:30 or 1h 30m' },
  member: { label: 'Member', icon: '👤', hint: 'One or more board members, e.g. owner or reviewer' },
  cardref: { label: 'Card reference', icon: '⇄', hint: 'Links to other cards on this board' },
  checklist: { label: 'Checklist progress', icon: '☑', hint: 'Worked out from the card\'s checklists (all, or one by name)' },
  cardid: { label: 'Card ID', icon: '№', hint: 'The card\'s number on this board, e.g. #42' },
  carddate: { label: 'Card date', icon: '🕓', hint: 'When the card was created, last changed or is due' },
  url: { label: 'Link', icon: '↗', hint: 'A web address, opened in a new tab' },
  email: { label: 'Email', icon: '@', hint: 'Click to send an email' },
  phone: { label: 'Phone', icon: '☎', hint: 'Click to call' },
  section: { label: 'Section tab', icon: '▤', hint: 'Groups the fields below it into a tab on the card' },
  header: { label: 'Field header', icon: 'H', hint: 'A coloured heading between fields' }
};
export const LAYOUT_TYPES = ['section', 'header'];
export const COMPUTED_TYPES = ['checklist', 'cardid', 'carddate'];
export const COLORS = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'light-gray'];
export const WIDTHS = { full: 'Full width', half: '1/2 width', third: '1/3 width' };
export { PROGRESS_STYLES, RATING_STYLES, TOGGLE_STYLES, NUMBER_FORMATS, DATE_FORMATS, DURATION_FORMATS };

export function isLayout(field) {
  return LAYOUT_TYPES.includes(field.type);
}

export function isComputed(field) {
  return COMPUTED_TYPES.includes(field.type);
}

export function newId() {
  return `f${uid()}`;
}

const opt = (label, color) => ({ id: newId(), label, color });
const T = (group, name, desc, make, sample) => ({ group, name, desc, make, sample });

/**
 * Field gallery, grouped like a catalogue. `make()` returns a new field definition;
 * `sample` is the value shown in the gallery preview.
 */
export const TEMPLATES = [
  T('Basic', 'Text Field', 'Single-line text', () => ({ type: 'text', name: 'Text Field' }), 'Meet next week'),
  T('Basic', 'Checkbox Field', 'Toggle on/off with 15 visual styles', () => ({ type: 'checkbox', name: 'Checkbox Field', style: 'checkbox' }), true),
  T('Basic', 'Dropdown Field', 'Pick from your custom options with colour-coded badges', () => ({ type: 'choice', display: 'dropdown', name: 'Dropdown Field', options: [opt('Option 1', 'blue'), opt('Option 2', 'green')] }), 0),
  T('Basic', 'Segment Button', 'Inline button group for quick single-select with coloured options', () => ({ type: 'choice', display: 'buttons', name: 'Segment Button', options: [opt('Opt A', 'red'), opt('Opt B', 'blue')] }), 0),
  T('Basic', 'Coloured Chips', 'Multi-select chips with colours, great for tags and labels', () => ({ type: 'multi', name: 'Coloured Chips', options: [opt('Opt A', 'blue'), opt('Opt B', 'yellow'), opt('Opt C', 'orange')] }), [0, 2]),
  T('Basic', 'Number Field', 'Numbers with currency, percentage or scientific formatting', () => ({ type: 'number', name: 'Number Field', format: 'standard', decimals: 2 }), 42),
  T('Basic', 'Date / Time Field', 'Dates with 29 display formats and deadline colour alerts', () => ({ type: 'date', name: 'Date / Time Field', format: 'dateMedium', deadline: true }), 'soon'),
  T('Basic', 'Member Field', 'Pick one or more board members, such as an owner or reviewers', () => ({ type: 'member', name: 'Owner', multiple: false }), 'member'),
  T('Basic', 'Progress Bar Field', 'Visual progress with 15 bar styles or your own emoji', () => ({ type: 'progress', name: 'Progress Bar Field', style: 'smooth' }), 65),
  T('Basic', 'Duration Field', 'Track elapsed time as 01:30 or 1h 30m', () => ({ type: 'duration', name: 'Duration', format: 'clock' }), 90),

  T('Examples', 'Status Field', 'Ready-to-use status dropdown; change the labels and colours', () => ({ type: 'choice', display: 'dropdown', name: 'Status', badge: true, options: [opt('Not started', 'light-gray'), opt('In Progress', 'blue'), opt('Waiting on client', 'orange'), opt('Done', 'green')] }), 1),
  T('Examples', 'Priority Field', 'Low / Med / High / Critical preset; adjust levels to fit', () => ({ type: 'choice', display: 'dropdown', name: 'Priority', options: [opt('Low', 'light-gray'), opt('Medium', 'yellow'), opt('High', 'orange'), opt('Critical', 'red')] }), 2),
  T('Examples', 'URL Field', 'Validated, clickable web links', () => ({ type: 'url', name: 'Website', placeholder: 'https://' }), 'https://example.com'),
  T('Examples', 'Phone Field', 'Phone number with click-to-call', () => ({ type: 'phone', name: 'Phone' }), '(555) 123-4567'),
  T('Examples', 'Email Field', 'Validated email with click-to-send', () => ({ type: 'email', name: 'Email' }), 'hello@example.com'),
  T('Examples', 'Required Text', 'Turns red when empty', () => ({ type: 'text', name: 'Required Text', required: true, placeholder: 'Add text…' }), ''),
  T('Examples', 'Multi-line Text Area', 'Full-width notes area for longer content', () => ({ type: 'notes', name: 'Notes', placeholder: 'Meeting notes…' }), 'Meeting notes:\n- agree fee'),
  T('Examples', 'Like (Thumbs Up)', 'Thumbs-up approval toggle; swap to 14 other icon styles', () => ({ type: 'checkbox', name: 'Like', style: 'like' }), true),
  T('Examples', 'Checklist Progress', 'Works out checklist completion, filter by checklist name', () => ({ type: 'checklist', name: 'Checklist Progress', style: 'smooth', checklist: '' }), { done: 3, total: 4 }),
  T('Examples', 'Percentage with Colour', 'Colour shifts at 33 / 66 / 100 %; adjust the thresholds', () => ({ type: 'number', name: 'Percentage', format: 'percent100', decimals: 0, scale: true, low: 33, high: 66 }), 72),
  T('Examples', 'Card ID Text', 'The card\'s number on the board, e.g. #42, with your own prefix', () => ({ type: 'cardid', name: 'Card ID', prefix: '#' }), '#42'),
  T('Examples', 'Currency Field', 'Money with any currency symbol', () => ({ type: 'number', name: 'Amount', format: 'currency', currency: 'GBP', decimals: 2 }), 1500),
  T('Examples', 'Rating Field', '5-star rating; swap in hearts, circles, emoji or other icons', () => ({ type: 'rating', name: 'Rating', max: 5, style: 'classicStars' }), 4),
  T('Examples', 'Deadline Date', 'Goes orange then red as the deadline nears; adjust warning days', () => ({ type: 'date', name: 'Deadline', format: 'dateMedium', deadline: true, warnDays: 7, badge: true, badgeName: true }), 'soon'),
  T('Examples', 'Ball Colour Progress', 'Emoji progress bar; design your own symbols', () => ({ type: 'progress', name: 'Progress', style: 'custom', filled: '🔵', empty: '⚪' }), 70),
  T('Examples', 'Last Updated', 'When the card was last changed (or created, or due)', () => ({ type: 'carddate', name: 'Last Updated', source: 'activity', format: 'datetime24Medium' }), 'now'),

  T('Advanced', 'Card Reference', 'Link cards together: great for clients, projects or dependencies', () => ({ type: 'cardref', name: 'Related cards', multiple: true }), 'card'),
  T('Advanced', 'Field Header', 'Add coloured section headers to organise your fields', () => ({ type: 'header', name: 'Header', color: 'blue' }), null),
  T('Advanced', 'Section Tab', 'Group the fields below it into switchable tabs to reduce clutter', () => ({ type: 'section', name: 'Section' }), null),

  ...Object.entries(PROGRESS_STYLES).filter(([k]) => k !== 'custom' && k !== 'bar').map(([k, s], i) => T('Progress Bars', s.label, s.desc, () => ({ type: 'progress', name: s.label, style: k }), [65, 50, 72, 40, 60, 55, 70, 45, 80, 35, 90, 25, 58][i] ?? 50)),
  ...Object.entries(RATING_STYLES).map(([k, s]) => T('Ratings', s.label, s.desc, () => ({ type: 'rating', name: s.label, style: k, max: 5 }), 4)),
  ...Object.entries(TOGGLE_STYLES).filter(([k]) => k !== 'like').map(([k, s]) => T('Toggles', s.label, s.desc, () => ({ type: 'checkbox', name: s.label, style: k }), true)),
  ...Object.entries(NUMBER_FORMATS).map(([k, s]) => T('Numbers', s.label, s.desc, () => ({ type: 'number', name: s.label, format: k, decimals: 2, currency: 'GBP' }), s.example)),
  ...Object.entries(DATE_FORMATS).map(([k, s]) => T('Dates', s.label, s.desc, () => ({ type: 'date', name: s.label, format: k, deadline: s.kind !== 'time' && k !== 'yearOnly' && k !== 'monthYearShort' }), 'fixed')),

  T('Practice', 'VAT status', 'VAT / Non-VAT buttons', () => ({ type: 'choice', display: 'buttons', name: 'VAT Status', badge: true, options: [opt('VAT', 'green'), opt('Non-VAT', 'light-gray')] }), 0),
  T('Practice', 'Company number', 'Companies House number', () => ({ type: 'text', name: 'Company Number', placeholder: '01234567', width: 'third' }), '01234567'),
  T('Practice', 'UTR', 'Unique taxpayer reference', () => ({ type: 'text', name: 'UTR', placeholder: '10 digits', width: 'third' }), '1234567890'),
  T('Practice', 'Year end', 'Accounting year end', () => ({ type: 'date', name: 'Year end', format: 'dateMedium', deadline: false, width: 'third' }), 'soon'),
  T('Practice', 'Fee', 'Annual fee in pounds', () => ({ type: 'number', name: 'Fee', format: 'currency', currency: 'GBP', decimals: 2, width: 'third' }), 1500),
  T('Practice', 'Services', 'What you do for the client', () => ({ type: 'multi', name: 'Services', options: [opt('Bookkeeping', 'green'), opt('Accounts', 'blue'), opt('VAT', 'purple'), opt('Payroll', 'orange'), opt('Self assessment', 'sky')] }), [0, 2]),
  T('Practice', 'Things to check', 'Schedule notes with headings and bullets', () => ({ type: 'notes', name: 'Things to check', placeholder: 'Debtors:\n- August sales missing' }), 'Creditors:\n- Accruals reversal?'),
  T('Practice', 'Time spent', 'Hours on the job', () => ({ type: 'duration', name: 'Time spent', format: 'words', width: 'third' }), 150)
];

/** A complete new field definition from a template. */
export function fromTemplate(tpl) {
  const base = tpl.make();
  if (isLayout(base)) return { id: newId(), color: '', ...base };
  return { id: newId(), shown: true, badge: false, badgeName: false, required: false, help: '', placeholder: '', width: 'full', label: 'top', color: '', ...base };
}

const SAMPLE_DAY = '1983-10-14';
/** The gallery preview value of a template, resolved against the field it makes. */
export function sampleValue(tpl, field) {
  const s = tpl.sample;
  if (field.type === 'choice') return field.options[s] ? field.options[s].id : null;
  if (field.type === 'multi') return (s || []).map((i) => field.options[i] && field.options[i].id).filter(Boolean);
  if (field.type === 'date') {
    const kind = (DATE_FORMATS[field.format] || DATE_FORMATS.dateMedium).kind;
    if (s === 'soon') return kind === 'time' ? '09:30' : new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    return kind === 'time' ? '09:30' : kind === 'datetime' ? new Date(1983, 9, 14, 9, 30).toISOString() : SAMPLE_DAY;
  }
  if (field.type === 'carddate') return new Date(Date.now() - 3 * 3600000).toISOString();
  if (field.type === 'member') return [SAMPLE_MEMBER.id];
  if (field.type === 'cardref') return [SAMPLE_CARD.id];
  return s;
}

/** Stand-ins used by previews when the real board data is not at hand. */
export const SAMPLE_MEMBER = { id: '000000000000000000000001', fullName: 'Ada Lovelace', username: 'ada' };
export const SAMPLE_CARD = { id: '000000000000000000000002', name: 'Example client card', idShort: 42 };

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

export const formatNumber = formatNumberValue;

export function stars(field, value) {
  return ratingText(field.style, value, field.max || 5);
}

export function bar(value, cells = 10) {
  return progressText('parallelogram', value, { cells });
}

export function progressBar(field, value, cells = 10) {
  return progressText(field.style || 'bar', value, { cells, filled: field.filled, empty: field.empty });
}

/**
 * Field context: what computed fields and names need.
 * { members: [{id, fullName, username}], cards: Map(id -> {id, name, idShort, dateLastActivity, due, badges}),
 *   checklists: Map(cardId -> [{ name, done, total }]) | null }
 */
export function emptyContext() {
  return { members: [], cards: new Map(), checklists: null };
}

/** Created time of a Trello object from its id (the first 8 hex digits are seconds since 1970). */
export function createdAt(id) {
  const s = parseInt(String(id || '').slice(0, 8), 16);
  return Number.isFinite(s) && s > 0 ? new Date(s * 1000).toISOString() : null;
}

/** Value of a computed field for a card, or null. */
export function computedValue(field, cardId, ctx = emptyContext()) {
  const card = ctx.cards.get(cardId) || null;
  switch (field.type) {
    case 'cardid': return card && card.idShort ? `${field.prefix ?? '#'}${card.idShort}` : null;
    case 'carddate':
      if (field.source === 'activity') return card ? card.dateLastActivity || null : null;
      if (field.source === 'due') return card ? card.due || null : null;
      return createdAt(cardId);
    case 'checklist': {
      const filter = (field.checklist || '').trim().toLowerCase();
      const lists = ctx.checklists ? ctx.checklists.get(cardId) || [] : null;
      if (lists) {
        const picked = filter ? lists.filter((l) => l.name.toLowerCase().includes(filter)) : lists;
        const total = picked.reduce((n, l) => n + l.total, 0);
        return total ? { done: picked.reduce((n, l) => n + l.done, 0), total } : null;
      }
      if (!filter && card && card.badges && card.badges.checkItems) return { done: card.badges.checkItemsChecked || 0, total: card.badges.checkItems };
      return null;
    }
    default: return null;
  }
}

/** Stored values plus computed ones, for a card. */
export function valuesWithComputed(fields, values, cardId, ctx) {
  const out = { ...(values || {}) };
  for (const f of fields) if (isComputed(f)) out[f.id] = computedValue(f, cardId, ctx);
  return out;
}

function memberName(ctx, id) {
  const m = ((ctx && ctx.members) || []).find((x) => x.id === id) || (id === SAMPLE_MEMBER.id ? SAMPLE_MEMBER : null);
  return m ? (m.fullName || m.username) : 'Former member';
}

function cardName(ctx, id) {
  const c = (ctx && ctx.cards && ctx.cards.get(id)) || (id === SAMPLE_CARD.id ? SAMPLE_CARD : null);
  return c ? c.name : 'Card not on this board';
}

function notesSummary(text) {
  return String(text).split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean).join(' · ');
}

const pct = (v) => (v.total ? Math.round((v.done / v.total) * 100) : 0);

/** Plain-text rendering of a value (table cells, CSV, badges, search). */
export function formatValue(field, value, { short = false, ctx = null } = {}) {
  if (isEmpty(value) && field.type !== 'checkbox') return '';
  switch (field.type) {
    case 'choice': { const o = optionOf(field, value); return o ? o.label : ''; }
    case 'multi': return (Array.isArray(value) ? value : []).map((v) => optionOf(field, v)).filter(Boolean).map((o) => o.label).join(', ');
    case 'checkbox': return value ? 'Yes' : '';
    case 'number': return formatNumberValue(field, value);
    case 'rating': return short ? stars(field, value) : `${value}/${field.max || 5}`;
    case 'progress': return short ? `${progressBar(field, value)} ${value}%` : `${value}%`;
    case 'date':
    case 'carddate': return formatDateValue(field, value);
    case 'duration': return formatDuration(field, value);
    case 'member': return (Array.isArray(value) ? value : [value]).map((id) => memberName(ctx, id)).join(', ');
    case 'cardref': return (Array.isArray(value) ? value : [value]).map((id) => cardName(ctx, id)).join(', ');
    case 'checklist': return short ? `${progressText(field.style || 'parallelogram', pct(value), { filled: field.filled, empty: field.empty })} ${value.done}/${value.total}` : `${value.done}/${value.total}`;
    case 'notes': return short ? truncate(notesSummary(value), 60) : String(value);
    case 'url': return short ? String(value).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : String(value);
    default: return String(value);
  }
}

/** Number to sort and compare by, or null. */
export function sortValue(field, value) {
  if (isEmpty(value)) return null;
  switch (field.type) {
    case 'number': case 'rating': case 'progress': case 'duration': return Number(value);
    case 'checklist': return value.total ? value.done / value.total : 0;
    case 'date': case 'carddate': { const d = toDate(dateKind(field), value); return d ? d.getTime() : null; }
    case 'choice': return (field.options || []).findIndex((o) => o.id === value);
    case 'checkbox': return value ? 1 : 0;
    default: return null;
  }
}

/** Card-front badges for the visible fields that have "Show value on card front" on. */
export function badgesFor(fields, card, { ctx = null, cardId = null } = {}) {
  const stored = (card && card.values) || {};
  const values = cardId ? valuesWithComputed(fields, stored, cardId, ctx || emptyContext()) : stored;
  const out = [];
  for (const f of visibleFields(fields, card ? card.visible : null)) {
    if (!f.badge) continue;
    const value = values[f.id];
    const named = (text) => (f.badgeName ? `${f.name}: ${text}` : text);
    if (isEmpty(value) && f.type !== 'checkbox') {
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
      case 'checkbox': {
        const s = TOGGLE_STYLES[f.style] || TOGGLE_STYLES.checkbox;
        if (value) out.push({ text: `${s.on || '✓'} ${f.name}`, color: 'green' });
        else if (s.off && !s.fadeOff) out.push({ text: `${s.off} ${f.name}` });
        break;
      }
      case 'date': {
        const text = named(formatDateValue(f, value));
        const day = dayOf(f, value);
        out.push(f.deadline === false || !day ? { text } : { text, color: dateColor(f, day, deadlineColor) });
        break;
      }
      case 'carddate': out.push({ text: named(formatDateValue(f, value)) }); break;
      case 'rating': out.push({ text: named(stars(f, value)) }); break;
      case 'progress': out.push({ text: named(`${progressBar(f, value, 5)} ${value}%`), color: scaleColor(f, value) || (value >= 100 ? 'green' : undefined) }); break;
      case 'checklist': out.push({ text: named(`☑ ${value.done}/${value.total}`), color: value.done >= value.total ? 'green' : undefined }); break;
      case 'number': out.push({ text: named(truncate(formatNumberValue(f, value), 24)), color: scaleColor(f, value) || undefined }); break;
      case 'notes': break;
      default: out.push({ text: named(truncate(formatValue(f, value, { short: true, ctx }), 24)) });
    }
  }
  return out.map((b) => (b.color ? b : { text: b.text }));
}

/** Checklist counts per card for a board: Map(cardId -> [{ name, done, total }]), or null without access. */
export async function boardChecklists(t, boardId) {
  try {
    const lists = await trelloApi(t, 'GET', `/boards/${boardId}/checklists`, { fields: 'name,idCard', checkItems: 'all', checkItem_fields: 'state' });
    const map = new Map();
    for (const l of lists || []) {
      const items = l.checkItems || [];
      const entry = { name: l.name || '', done: items.filter((i) => i.state === 'complete').length, total: items.length };
      map.set(l.idCard, [...(map.get(l.idCard) || []), entry]);
    }
    return map;
  } catch (err) {
    console.warn('Keel: checklist counts unavailable', err.message);
    return null;
  }
}

/**
 * Field context for a board: members, cards (for card references, card IDs, dates and
 * checklist totals) and, when a checklist field filters by name, per-checklist counts.
 */
export async function loadContext(t, fields, { boardId, cards = null } = {}) {
  const [board, list] = await Promise.all([
    t.board('id', 'members').catch(() => ({ members: [] })),
    cards ? Promise.resolve(cards) : t.cards('id', 'name', 'idShort', 'dateLastActivity', 'due', 'badges', 'closed').catch(() => [])
  ]);
  const ctx = { members: board.members || [], cards: new Map((list || []).filter((c) => !c.closed).map((c) => [c.id, c])), checklists: null };
  if (fields.some((f) => f.type === 'checklist' && (f.checklist || '').trim())) ctx.checklists = await boardChecklists(t, boardId || board.id);
  return ctx;
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
