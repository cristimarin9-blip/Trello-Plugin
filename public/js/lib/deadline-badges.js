// Which deadline badges appear on card fronts. Chosen per board in the Power-Up
// settings ("Card-front deadlines"); field badges are chosen per field in Fields.
export const DEADLINE_BADGES = [
  { id: 'chStatus', group: 'Companies House', label: 'Company status (only when not active)' },
  { id: 'accounts', group: 'Companies House', label: 'Accounts due' },
  { id: 'confirmation', group: 'Companies House', label: 'Confirmation statement due' },
  { id: 'ctPayment', group: 'Companies House', label: 'Corporation tax payment (estimate)' },
  { id: 'ctReturn', group: 'Companies House', label: 'CT600 return (estimate)', default: false },
  { id: 'crm_bookkeeping', group: 'Client stages', label: 'Bookkeeping' },
  { id: 'crm_accounts', group: 'Client stages', label: 'Year-end accounts' },
  { id: 'crm_vat', group: 'Client stages', label: 'VAT return' },
  { id: 'crm_paye', group: 'Client stages', label: 'PAYE / payroll' }
];

/** { badgeId: true/false } from board settings, with defaults and the older stageBadges switch. */
export function shownBadges(settings = {}) {
  const out = Object.fromEntries(DEADLINE_BADGES.map((b) => [b.id, b.default !== false]));
  if (settings.stageBadges === false) for (const b of DEADLINE_BADGES) if (b.id.startsWith('crm_')) out[b.id] = false;
  for (const [k, v] of Object.entries(settings.cardBadges || {})) if (k in out && typeof v === 'boolean') out[k] = v;
  return out;
}
