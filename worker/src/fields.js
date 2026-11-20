// Field definitions and value validation for Keel's "Fields" feature.
// Pure functions only (no Cloudflare or Trello APIs), so they can be unit tested in Node.

export const FIELD_TYPES = ['text', 'notes', 'number', 'date', 'choice', 'checkbox'];
export const BADGE_COLORS = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'light-gray'];

export const LIMITS = {
  fields: 60,          // fields per board
  options: 30,         // options per choice field
  name: 60,            // field name length
  option: 40,          // option label length
  text: 2000,          // single-line text value
  notes: 20000,        // notes value
  card: 100000         // JSON size of one card's values
};

export class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; }
}

const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isTrelloId(value) {
  return typeof value === 'string' && /^[0-9a-f]{24}$/.test(value);
}

function cleanText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
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
    const field = { id, name, type, shown: f.shown !== false, badge: type !== 'notes' && !!f.badge };
    if (type === 'choice') {
      const options = Array.isArray(f.options) ? f.options : [];
      if (!options.length) throw new ValidationError(`"${name}" needs at least one option`);
      if (options.length > LIMITS.options) throw new ValidationError(`"${name}" can have at most ${LIMITS.options} options`);
      const optIds = new Set();
      field.options = options.map((o, j) => {
        const oid = String((o && o.id) || '');
        if (!ID_RE.test(oid) || optIds.has(oid)) throw new ValidationError(`Option ${j + 1} of "${name}" has an invalid id`);
        optIds.add(oid);
        const label = cleanText(o.label, LIMITS.option);
        if (!label) throw new ValidationError(`Option ${j + 1} of "${name}" needs a label`);
        return { id: oid, label, color: BADGE_COLORS.includes(o.color) ? o.color : 'light-gray' };
      });
    }
    return field;
  });
}

/** Validate one value for a field. Returns the normalised value, or null to clear it. */
export function sanitizeValue(field, value) {
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
      const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
      if (!Number.isFinite(n)) throw new ValidationError(`"${field.name}" must be a number`);
      return n;
    }
    case 'date': {
      if (!DATE_RE.test(String(value)) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new ValidationError(`"${field.name}" must be a date (YYYY-MM-DD)`);
      return String(value);
    }
    case 'choice': {
      if (!field.options.some((o) => o.id === value)) throw new ValidationError(`"${field.name}" has no option ${value}`);
      return value;
    }
    case 'checkbox':
      if (typeof value !== 'boolean') throw new ValidationError(`"${field.name}" must be true or false`);
      return value || null;
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
    visible = [...new Set(patch.visible.filter((id) => byId.has(id)))];
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
