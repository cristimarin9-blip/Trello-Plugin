// Small helpers shared by the connector and the iframe pages.

const DAY = 24 * 60 * 60 * 1000;

/**
 * Absolute URL of a page in public/views/. Use this for t.popup / t.modal: a relative
 * './views/x.html' only works from the connector (index.html), not from inside a view.
 */
export function viewUrl(name) {
  return new URL(`../../views/${name}`, import.meta.url).href;
}

/**
 * Save a date / date-time / month <input> only when the person has finished with it:
 * when they leave the box or press Enter (or pick a date while the box is not focused).
 * Browsers report a date as soon as it is valid, so typing 2026 one digit at a time gives
 * 0002, 0020, 0202, and changing the month of a filled-in date is "valid" after one
 * digit; saving then redraws the box and throws away the rest of the typing. Years must
 * have four digits and, with `minYear`, be at least that year. Clearing saves empty.
 */
export function bindDateCommit(input, commit, { minYear = 1000 } = {}) {
  let last = input.value;
  const yearOf = (v) => Number(String(v).slice(0, 4)) || 0;
  if (minYear > 1000 && (input.type === 'date' || input.type === 'month' || input.type === 'datetime-local')) {
    input.min = input.type === 'month' ? `${minYear}-01` : input.type === 'date' ? `${minYear}-01-01` : `${minYear}-01-01T00:00`;
  }
  let focused = false;
  const attempt = (final) => {
    const v = input.value;
    // A half-typed date reads as empty; keep the saved date rather than clearing it.
    if (!v && input.validity && input.validity.badInput) { if (final) input.value = last; return; }
    if (v === last) return;
    if (v && yearOf(v) < 1000) return; // still typing the year
    if (v && yearOf(v) < minYear) {
      if (final) { input.setCustomValidity(`Use a year from ${minYear} onwards`); input.reportValidity(); }
      return;
    }
    input.setCustomValidity('');
    last = v;
    commit(v);
  };
  // Chrome can report the box as not focused while it moves between day, month and year,
  // so focus is tracked here rather than read from document.activeElement.
  input.addEventListener('focus', () => { focused = true; });
  input.addEventListener('change', () => { if (!focused) attempt(true); });
  input.addEventListener('blur', () => { focused = false; attempt(true); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); attempt(true); } });
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Tiny DOM builder: el('div', {class:'x', onclick: fn}, 'text', childEl) */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs || {})) {
    if (val === undefined || val === null || val === false) continue;
    if (key.startsWith('on') && typeof val === 'function') node.addEventListener(key.slice(2), val);
    else if (key === 'class') node.className = val;
    else if (key === 'dataset') Object.assign(node.dataset, val);
    else if (key === 'checked' || key === 'disabled' || key === 'selected') node[key] = !!val;
    else if (key === 'value') node.value = val;
    else node.setAttribute(key, val);
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Parse 'YYYY-MM-DD' or ISO strings as a local-date-safe Date (midnight UTC for date-only). */
export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toDateInput(date) {
  const d = parseDate(date);
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

export function formatDate(value, opts = {}) {
  const d = parseDate(value);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', ...opts });
}

export function formatDateTime(value) {
  const d = parseDate(value);
  if (!d) return '';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(value) {
  const d = parseDate(value);
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(d);
}

/** Whole days from today (UTC date) until the given date; negative when past. */
export function daysUntil(value) {
  const d = parseDate(value);
  if (!d) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((target - todayUtc) / DAY);
}

/** Trello badge colour for a deadline. */
export function deadlineColor(value, overdue = false) {
  const days = daysUntil(value);
  if (overdue || (days !== null && days < 0)) return 'red';
  if (days === null) return 'light-gray';
  if (days <= 14) return 'red';
  if (days <= 30) return 'orange';
  if (days <= 60) return 'yellow';
  return 'green';
}

export function deadlineText(label, value, overdue = false) {
  const days = daysUntil(value);
  if (days === null) return `${label}: unknown`;
  if (overdue || days < 0) return `${label} OVERDUE (${formatDate(value, { year: undefined })})`;
  if (days === 0) return `${label} due today`;
  if (days <= 60) return `${label} ${days}d`;
  return `${label} ${formatDate(value, { year: undefined })}`;
}

/** Add calendar months (clamping to the last day of the target month) plus optional days. */
export function addMonths(value, months, extraDays = 0) {
  const d = parseDate(value);
  if (!d) return null;
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return new Date(Date.UTC(year, month, day) + extraDays * DAY).toISOString().slice(0, 10);
}

/**
 * Statutory "N months from the end of the period" arithmetic. When the period
 * ends on the last day of a month the result is also a month end (30 June + 9
 * months = 31 March, as HMRC and Companies House apply it), otherwise the
 * corresponding day. `extraDays` is added afterwards (e.g. +1 for CT payment).
 */
export function monthsFromEnd(value, months, extraDays = 0) {
  const d = parseDate(value);
  if (!d) return null;
  const isMonthEnd = endOfMonth(d) === toDateInput(d);
  const base = isMonthEnd ? endOfMonth(addMonths(d, months)) : addMonths(d, months);
  return addMonths(base, 0, extraDays);
}

export function endOfMonth(value) {
  const d = parseDate(value);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

export function truncate(text, max = 24) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function jsonSize(value) {
  return JSON.stringify(value ?? null).length;
}

export function byId(id) {
  return document.getElementById(id);
}

export function setStatus(message, kind = 'info') {
  const node = byId('status');
  if (!node) return;
  node.textContent = message || '';
  node.className = `status ${message ? kind : ''}`;
}
