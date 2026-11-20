// Field definitions, values and saved table views for Keel's "Fields" feature.
// Pure functions only (no Cloudflare or Trello APIs), so they can be unit tested in Node.

// Value types, plus two layout types that hold no value: "section" (starts a tab that
// groups the fields after it) and "header" (a heading between fields).
export const FIELD_TYPES = ['text', 'notes', 'number', 'date', 'choice', 'multi', 'checkbox', 'rating', 'progress', 'url', 'email', 'phone', 'section', 'header'];
export const LAYOUT_TYPES = ['section', 'header'];
export const BADGE_COLORS = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'light-gray'];
export const NUMBER_FORMATS = ['plain', 'gbp', 'eur', 'usd', 'percent'];
export const WIDTHS = ['full', 'half', 'third'];
export const FILTER_OPS = ['is', 'not', 'contains', 'empty', 'notempty', 'before', 'after', 'gt', 'lt'];
export const VIEW_LIMITS = [50, 100, 250, 500, 1000];

export const LIMITS = {
  fields: 80,          // fields per board (including sections and headers)
  options: 30,         // options per choice / multi field
  name: 60,            // field name length
  option: 40,          // option label length
  help: 300,           // help text
  placeholder: 100,    // placeholder
  text: 2000,          // single-line text value
  notes: 20000,        // notes value
  url: 1000,
  card: 100000,        // JSON size of one card's values
  views: 20            // saved table views per board
};

export class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; }
}

const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-.\s]{3,40}$/;

export function isTrelloId(value) {
  return typeof value === 'string' && /^[0-9a-f]{24}$/.test(value);
}

export function isLayout(field) {
  return LAYOUT_TYPES.includes(field.type);
}

function cleanText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
}

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function sanitizeOptions(f, name) {
  const options = Array.isArray(f.options) ? f.options : [];
  if (!options.length) throw new ValidationError(`"${name}" needs at least one option`);
  if (options.length > LIMITS.options) throw new ValidationError(`"${name}" can have at most ${LIMITS.options} options`);
  const ids = new Set();
  return options.map((o, j) => {
    const oid = String((o && o.id) || '');
    if (!ID_RE.test(oid) || ids.has(oid)) throw new ValidationError(`Option ${j + 1} of "${name}" has an invalid id`);
    ids.add(oid);
    const label = cleanText(o.label, LIMITS.option);
    if (!label) throw new ValidationError(`Option ${j + 1} of "${name}" needs a label`);
    return { id: oid, label, color: pick(o.color, BADGE_COLORS, 'light-gray') };
  });
}

/** Validate and normalise a board's field definitions. Throws ValidationError. */
export function sanitizeFields(input) {
  if (!Array.isArray(input)) throw new ValidationError('fields must be a list');
  if (input.length > LIMITS.fields) throw new ValidationError(`A board can have at most ${LIMITS.fields} fields`);
  const seen = new Set();
  return input.map((f, i) => {
    if (!f || typeof f !== 'object') throw new ValidationError(`Field ${i + 1} is not valid`);
    const id = String(f.id || '');
    if (!ID_RE.test(id)) throw new ValidationError(`Field ${i + 1} has an invalid id`);
    if (seen.has(id)) throw new ValidationError(`Duplicate field id ${id}`);
    seen.add(id);
    const name = cleanText(f.name, LIMITS.name);
    if (!name) throw new ValidationError(`Field ${i + 1} needs a name`);
    const type = FIELD_TYPES.includes(f.type) ? f.type : null;
    if (!type) throw new ValidationError(`"${name}" has an unknown type`);
    const field = { id, name, type, color: pick(f.color, BADGE_COLORS, '') };
    if (type === 'section') {
      field.collapsed = !!f.collapsed;
      return field;
    }
    if (type === 'header') return field;
    Object.assign(field, {
      shown: f.shown !== false,
      badge: type !== 'notes' && !!f.badge,
      badgeName: !!f.badgeName,
      required: type !== 'checkbox' && !!f.required,
      help: cleanText(f.help, LIMITS.help),
      placeholder: cleanText(f.placeholder, LIMITS.placeholder),
      width: pick(f.width, WIDTHS, 'full'),
      label: pick(f.label, ['top', 'left'], 'top')
    });
    if (type === 'choice') {
      field.options = sanitizeOptions(f, name);
      field.display = pick(f.display, ['buttons', 'dropdown'], 'buttons');
    }
    if (type === 'multi') field.options = sanitizeOptions(f, name);
    if (type === 'number') {
      field.format = pick(f.format, NUMBER_FORMATS, 'plain');
      const d = Number(f.decimals);
      field.decimals = Number.isInteger(d) && d >= 0 && d <= 4 ? d : 2;
    }
    if (type === 'rating') {
      const m = Number(f.max);
      field.max = Number.isInteger(m) && m >= 3 && m <= 10 ? m : 5;
    }
    if (type === 'date') field.deadline = f.deadline !== false;
    return field;
  });
}

/** Validate one value for a field. Returns the normalised value, or null to clear it. */
export function sanitizeValue(field, value) {
  if (isLayout(field)) throw new ValidationError(`"${field.name}" does not hold a value`);
  if (value === null || value === undefined || value === '') return null;
  switch (field.type) {
    case 'text': {
      const v = cleanText(String(value).replace(/[\r\n]+/g, ' '), LIMITS.text);
      return v || null;
    }
    case 'notes': {
      const v = String(value).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
      if (v.length > LIMITS.notes) throw new ValidationError(`"${field.name}" is too long (max ${LIMITS.notes} characters)`);
      return v.trim() ? v.replace(/\s+$/, '') : null;
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(String(value).replace(/[,£$€%\s]/g, ''));
      if (!Number.isFinite(n)) throw new ValidationError(`"${field.name}" must be a number`);
      return n;
    }
    case 'progress': {
      const n = typeof value === 'number' ? value : Number(String(value).replace(/[%\s]/g, ''));
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new ValidationError(`"${field.name}" must be between 0 and 100`);
      return Math.round(n * 10) / 10;
    }
    case 'rating': {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > (field.max || 5)) throw new ValidationError(`"${field.name}" must be 0 to ${field.max || 5}`);
      return n || null;
    }
    case 'date': {
      if (!DATE_RE.test(String(value)) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new ValidationError(`"${field.name}" must be a date (YYYY-MM-DD)`);
      return String(value);
    }
    case 'choice': {
      if (!field.options.some((o) => o.id === value)) throw new ValidationError(`"${field.name}" has no option ${value}`);
      return value;
    }
    case 'multi': {
      if (!Array.isArray(value)) throw new ValidationError(`"${field.name}" must be a list of options`);
      const ids = new Set(field.options.map((o) => o.id));
      const picked = [...new Set(value)];
      if (picked.some((v) => !ids.has(v))) throw new ValidationError(`"${field.name}" has an unknown option`);
      return picked.length ? picked : null;
    }
    case 'checkbox':
      if (typeof value !== 'boolean') throw new ValidationError(`"${field.name}" must be true or false`);
      return value || null;
    case 'url': {
      let v = cleanText(value, LIMITS.url);
      if (v && !/^[a-z][a-z0-9+.-]*:/i.test(v)) v = `https://${v}`;
      if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v)) throw new ValidationError(`"${field.name}" must be a web address`);
      return v;
    }
    case 'email': {
      const v = cleanText(value, 254);
      if (!EMAIL_RE.test(v)) throw new ValidationError(`"${field.name}" must be an email address`);
      return v;
    }
    case 'phone': {
      const v = cleanText(value, 40);
      if (!PHONE_RE.test(v)) throw new ValidationError(`"${field.name}" must be a phone number`);
      return v;
    }
    default:
      throw new ValidationError('Unknown field type');
  }
}

/**
 * Validate a card update against the board's fields.
 * patch = { values?: { fieldId: value|null }, visible?: [fieldId]|null }
 * Returns { values (merge patch, null = remove), hasVisible, visible }.
 */
export function sanitizeCardPatch(fields, patch) {
  if (!patch || typeof patch !== 'object') throw new ValidationError('Nothing to save');
  const byId = new Map(fields.map((f) => [f.id, f]));
  const values = {};
  if (patch.values !== undefined) {
    if (!patch.values || typeof patch.values !== 'object' || Array.isArray(patch.values)) throw new ValidationError('values must be an object');
    for (const [id, value] of Object.entries(patch.values)) {
      const field = byId.get(id);
      if (!field) throw new ValidationError(`Unknown field ${id}: reload the card`);
      values[id] = sanitizeValue(field, value);
    }
  }
  const hasVisible = Object.prototype.hasOwnProperty.call(patch, 'visible');
  let visible = null;
  if (hasVisible && patch.visible !== null) {
    if (!Array.isArray(patch.visible)) throw new ValidationError('visible must be a list');
    visible = [...new Set(patch.visible.filter((id) => byId.has(id) && !isLayout(byId.get(id))))];
  }
  return { values, hasVisible, visible };
}

/** RFC 7396 merge of flat value maps: null removes a key. */
export function mergeValues(current, patch) {
  const next = { ...(current || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k]; else next[k] = v;
  }
  return next;
}

/** Saved table views: [{ id, name, search, filters, sort, columns, groupBy, limit }]. */
export function sanitizeViews(input) {
  if (!Array.isArray(input)) throw new ValidationError('views must be a list');
  if (input.length > LIMITS.views) throw new ValidationError(`At most ${LIMITS.views} saved views`);
  const key = (v) => cleanText(v, 40) || null;
  const ids = new Set();
  return input.map((v, i) => {
    if (!v || typeof v !== 'object') throw new ValidationError(`View ${i + 1} is not valid`);
    const id = String(v.id || '');
    if (!ID_RE.test(id) || ids.has(id)) throw new ValidationError(`View ${i + 1} has an invalid id`);
    ids.add(id);
    const name = cleanText(v.name, 40);
    if (!name) throw new ValidationError(`View ${i + 1} needs a name`);
    const filters = (Array.isArray(v.filters) ? v.filters : []).slice(0, 10).map((f) => ({
      field: key(f && f.field),
      op: pick(f && f.op, FILTER_OPS, 'is'),
      value: typeof (f && f.value) === 'number' || typeof (f && f.value) === 'boolean' ? f.value : cleanText(f && f.value, 200)
    })).filter((f) => f.field);
    const sort = v.sort && key(v.sort.field) ? { field: key(v.sort.field), dir: v.sort.dir === -1 ? -1 : 1 } : null;
    const columns = Array.isArray(v.columns) ? v.columns.slice(0, 100).map(key).filter(Boolean) : null;
    return { id, name, search: cleanText(v.search, 100), filters, sort, columns, groupBy: key(v.groupBy), limit: pick(Number(v.limit), VIEW_LIMITS, 250) };
  });
}
