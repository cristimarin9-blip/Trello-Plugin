// Feature: accountancy client stage tracker (bookkeeping, accounts, VAT, PAYE).
import { KEYS } from '../config.js';
import { get, getSettings } from '../lib/storage.js';
import { addMonths, monthsFromEnd, daysUntil, deadlineColor, formatDate } from '../lib/util.js';

export const TRACKS = {
  bookkeeping: {
    label: 'Bookkeeping', short: 'BK',
    stages: ['Not started', 'Records requested', 'Records received', 'In progress', 'Queries sent', 'Complete'],
    deadline: (periodEnd) => (periodEnd ? addMonths(periodEnd, 1) : null),
    deadlineLabel: 'Target (period end + 1 month)'
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

export function isFinal(trackKey, stage) {
  const stages = TRACKS[trackKey].stages;
  return stage === stages[stages.length - 1];
}

export function stageColor(trackKey, track, company) {
  if (!track || !track.on) return null;
  const stage = track.stage || TRACKS[trackKey].stages[0];
  if (isFinal(trackKey, stage)) return 'green';
  const due = TRACKS[trackKey].deadline(track.period, company);
  const days = daysUntil(due);
  if (days !== null && days < 0) return 'red';
  if (days !== null && days <= 14) return 'orange';
  if (stage === TRACKS[trackKey].stages[0]) return 'light-gray';
  return 'blue';
}

export function summarize(crm, company) {
  return TRACK_ORDER.filter((k) => crm && crm[k] && crm[k].on).map((k) => {
    const track = crm[k];
    const due = TRACKS[k].deadline(track.period, company);
    return { key: k, label: TRACKS[k].label, short: TRACKS[k].short, stage: track.stage || TRACKS[k].stages[0], period: track.period, due, color: stageColor(k, track, company), final: isFinal(k, track.stage) };
  });
}

export async function cardBadges(t, enabled) {
  if (enabled && !enabled.crm) return [];
  const settings = await getSettings(t);
  if (!settings.stageBadges) return [];
  const [crm, company] = await Promise.all([get(t, 'card', KEYS.crm), get(t, 'card', KEYS.company)]);
  return summarize(crm, company)
    .filter((s) => !s.final)
    .map((s) => ({ text: `${s.short}: ${s.stage}${s.due ? ` · ${formatDate(s.due, { year: undefined })}` : ''}`, color: s.color }));
}

export async function cardDetailBadges(t, enabled) {
  if (enabled && !enabled.crm) return [];
  const [crm, company] = await Promise.all([get(t, 'card', KEYS.crm), get(t, 'card', KEYS.company)]);
  return summarize(crm, company).map((s) => ({ title: s.label, text: `${s.stage}${s.due ? ` · due ${formatDate(s.due)}` : ''}`, color: s.color || deadlineColor(s.due) }));
}

export function boardButtons(icon) {
  return [{
    icon,
    text: 'Client CRM',
    condition: 'always',
    callback: (t) => t.modal({ title: 'Client CRM — stages at a glance', url: './views/crm-board.html', fullscreen: false, height: 640 })
  }];
}
