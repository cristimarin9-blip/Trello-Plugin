// Feature: Companies House snapshot badges. The lookup itself happens in the
// "Company" tab of the card back (js/tabs/company.js) through the worker proxy.
import { KEYS } from '../config.js';
import { get } from '../lib/storage.js';
import { deadlineColor, deadlineText } from '../lib/util.js';

export async function cardBadges(t, enabled) {
  if (enabled && !enabled.company) return [];
  const c = await get(t, 'card', KEYS.company);
  if (!c || !c.number) return [];
  const badges = [];
  if (c.status && c.status !== 'active') badges.push({ text: `CH: ${c.status}`, color: 'red' });
  if (c.accountsDue) badges.push({ text: deadlineText('Accounts', c.accountsDue, c.accountsOverdue), color: deadlineColor(c.accountsDue, c.accountsOverdue) });
  if (c.csDue) badges.push({ text: deadlineText('Conf. stmt', c.csDue, c.csOverdue), color: deadlineColor(c.csDue, c.csOverdue) });
  if (c.ctPaymentDue) badges.push({ text: deadlineText('CT pay', c.ctPaymentDue), color: deadlineColor(c.ctPaymentDue) });
  return badges;
}

export async function cardDetailBadges(t, enabled) {
  if (enabled && !enabled.company) return [];
  const c = await get(t, 'card', KEYS.company);
  if (!c || !c.number) return [];
  return [{
    title: 'Companies House',
    text: `${c.number} · ${c.status || '?'}`,
    color: c.status === 'active' ? 'green' : 'red',
    url: `https://find-and-update.company-information.service.gov.uk/company/${c.number}`
  }];
}
