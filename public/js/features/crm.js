// Feature: accountancy client stage tracker (bookkeeping, accounts, VAT, PAYE).
import { boardIcon } from '../lib/icons.js';
import { KEYS } from '../config.js';
import { get, getSettings } from '../lib/storage.js';
import { shownBadges } from '../lib/deadline-badges.js';
import { addMonths, monthsFromEnd, daysUntil, deadlineColor, formatDate, viewUrl } from '../lib/util.js';

export const DEFAULT_RULES = { bookkeeping: { months: 1, days: 0 } };

const intIn = (v, min, max, fallback) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : fallback; };

/** Deadline rules from board settings (only bookkeeping is adjustable; the rest are statutory). */
export function crmRules(settings) {
  const bk = (settings && settings.crmRules && settings.crmRules.bookkeeping) || {};
  return { bookkeeping: { months: intIn(bk.months, 0, 24, 1), days: intIn(bk.days, 0, 365, 0) } };
}

/** How a track's automatic deadline is worked out, in words. */
export function ruleText(key, rules = DEFAULT_RULES) {
  if (key !== 'bookkeeping') return TRACKS[key].deadlineLabel;
  const { months, days } = rules.bookkeeping;
  const parts = [months ? `${months} month${months === 1 ? '' : 's'}` : '', days ? `${days} day${days === 1 ? '' : 's'}` : ''].filter(Boolean);
  return parts.length ? `Target (period end + ${parts.join(' ')})` : 'Target (the period end)';
}

export const TRACKS = {
  bookkeeping: {
    label: 'Bookkeeping', short: 'BK',
    stages: ['Not started', 'Records requested', 'Records received', 'In progress', 'Queries sent', 'Complete'],
    // Adjustable per board (Power-Up settings): months and days after the period end.
    deadline: (periodEnd, company, rules = DEFAULT_RULES) => (periodEnd ? monthsFromEnd(periodEnd, rules.bookkeeping.months, rules.bookkeeping.days) : null),
    deadlineLabel: 'Target'
  },
  accounts: {
    label: 'Year-end accounts', short: 'Accts',
    stages: ['Not started', 'Records requested', 'Records received', 'Drafting', 'Review', 'Sent for approval', 'Approved', 'Filed'],
    deadline: (periodEnd, company) => (company && company.accountsDue) || (periodEnd ? monthsFromEnd(periodEnd, 9) : null),
    deadlineLabel: 'Companies House filing deadline'
  },
  vat: {
    label: 'VAT return', short: 'VAT',
    stages: ['Not started', 'Records requested', 'In progress', 'Review', 'Sent for approval', 'Approved', 'Submitted'],
    // HMRC: one calendar month and 7 days after the end of the VAT period.
    deadline: (periodEnd) => (periodEnd ? monthsFromEnd(periodEnd, 1, 7) : null),
    deadlineLabel: 'HMRC deadline (period end + 1 month 7 days)'
  },
  paye: {
    label: 'PAYE / payroll', short: 'PAYE',
    stages: ['Not started', 'Info requested', 'Processing', 'Review', 'Submitted (RTI)', 'Complete'],
    deadline: (periodEnd) => {
      if (!periodEnd) return null;
      const next = addMonths(periodEnd, 1);
      return `${next.slice(0, 7)}-22`;
    },
    deadlineLabel: 'HMRC payment deadline (22nd of following month)'
  }
};
export const TRACK_ORDER = ['bookkeeping', 'accounts', 'vat', 'paye'];

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DATE_NUM = '(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4}|\\d{2})(?!\\d)';
const DATE_TEXT = '(\\d{1,2})(?:st|nd|rd|th)?\\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?,?\\s*(\\d{4}|\\d{2})(?!\\d)';
const MARKER = '(?:YE|PE|QE|[YPQ]\\/E|year\\s*end|period\\s*end|quarter\\s*end)\\s*:?\\s*';

function isoDate(d, m, y) {
  const day = Number(d);
  const month = typeof m === 'string' && MONTHS[m.toLowerCase().slice(0, 3)] ? MONTHS[m.toLowerCase().slice(0, 3)] : Number(m);
  const year = String(y).length === 2 ? 2000 + Number(y) : Number(y);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Period end written in a card title (day first, UK style), e.g. "ACC YE31.08.26",
 * "VAT QE 30/06/2026", "Year end 31 Aug 2026". A date after YE / PE / QE / "year end"
 * wins; otherwise the first date in the title. Returns 'YYYY-MM-DD' or null.
 */
export function periodFromTitle(title) {
  const s = String(title || '');
  for (const pattern of [MARKER + DATE_NUM, MARKER + DATE_TEXT, `(?:^|[^\\d])${DATE_NUM}`, `(?:^|[^\\d])${DATE_TEXT}`]) {
    const m = s.match(new RegExp(pattern, 'i'));
    if (m) {
      const iso = isoDate(m[1], m[2], m[3]);
      if (iso) return iso;
    }
  }
  return null;
}

/** Period end for a track: from the card title, else a date saved before titles were used. */
export function periodOf(track, cardName) {
  return periodFromTitle(cardName) || (track && track.period) || null;
}

/** Today as 'YYYY-MM-DD' in the viewer's timezone. */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isFinal(trackKey, stage) {
  const stages = TRACKS[trackKey].stages;
  return stage === stages[stages.length - 1];
}

/** Deadline worked out from the period end (and Companies House for accounts). */
export function autoDeadline(key, track, company, cardName, rules = DEFAULT_RULES) {
  return TRACKS[key].deadline(periodOf(track, cardName), company, rules);
}

/** The deadline in use: one set by hand on the card, else the automatic one. */
export function deadlineOf(key, track, company, cardName, rules = DEFAULT_RULES) {
  return (track && track.deadline) || autoDeadline(key, track, company, cardName, rules);
}

export function stageColor(trackKey, track, company, cardName, rules = DEFAULT_RULES) {
  if (!track || !track.on) return null;
  const stage = track.stage || TRACKS[trackKey].stages[0];
  if (isFinal(trackKey, stage)) return 'green';
  const due = deadlineOf(trackKey, track, company, cardName, rules);
  const days = daysUntil(due);
  if (days !== null && days < 0) return 'red';
  if (days !== null && days <= 14) return 'orange';
  if (stage === TRACKS[trackKey].stages[0]) return 'light-gray';
  return 'blue';
}

export function summarize(crm, company, cardName, rules = DEFAULT_RULES) {
  return TRACK_ORDER.filter((k) => crm && crm[k] && crm[k].on).map((k) => {
    const track = crm[k];
    const period = periodOf(track, cardName);
    const due = deadlineOf(k, track, company, cardName, rules);
    return { key: k, label: TRACKS[k].label, short: TRACKS[k].short, stage: track.stage || TRACKS[k].stages[0], period, changed: track.changed || null, due, manual: !!track.deadline, color: stageColor(k, track, company, cardName, rules), final: isFinal(k, track.stage) };
  });
}

export async function cardBadges(t, enabled) {
  if (enabled && !enabled.crm) return [];
  const settings = await getSettings(t);
  const show = shownBadges(settings);
  const [crm, company, card] = await Promise.all([get(t, 'card', KEYS.crm), get(t, 'card', KEYS.company), t.card('name')]);
  return summarize(crm, company, card.name, crmRules(settings))
    .filter((s) => !s.final && show[`crm_${s.key}`])
    .map((s) => ({ text: `${s.short}: ${s.stage}${s.due ? ` · ${formatDate(s.due, { year: undefined })}` : ''}`, color: s.color }));
}

export async function cardDetailBadges(t, enabled) {
  if (enabled && !enabled.crm) return [];
  const [crm, company, card, settings] = await Promise.all([get(t, 'card', KEYS.crm), get(t, 'card', KEYS.company), t.card('name'), getSettings(t)]);
  return summarize(crm, company, card.name, crmRules(settings)).map((s) => ({ title: s.label, text: `${s.stage}${s.changed ? ` since ${formatDate(s.changed, { year: undefined })}` : ''}${s.due ? ` · due ${formatDate(s.due)}` : ''}`, color: s.color || deadlineColor(s.due) }));
}

export function boardButtons(icon) {
  return [{
    icon: boardIcon('crm'),
    text: 'Client CRM',
    condition: 'always',
    callback: (t) => t.modal({ title: 'Client CRM — stages at a glance', url: viewUrl('crm-board.html'), fullscreen: false, height: 640 })
  }];
}
