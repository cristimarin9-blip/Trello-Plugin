// Feature: Companies House snapshot badges. The lookup itself happens in the
// "Company" tab of the card back (js/tabs/company.js) through the worker proxy.
import { KEYS } from '../config.js';
import { get, getSettings } from '../lib/storage.js';
import { shownBadges } from '../lib/deadline-badges.js';
import { deadlineColor, deadlineText } from '../lib/util.js';

export async function cardBadges(t, enabled) {
  if (enabled && !enabled.company) return [];
  const [c, settings] = await Promise.all([get(t, 'card', KEYS.company), getSettings(t)]);
  if (!c || !c.number) return [];
  const show = shownBadges(settings);
  const badges = [];
  if (show.chStatus && c.status && c.status !== 'active') badges.push({ text: `CH: ${c.status}`, color: 'red' });
  if (show.accounts && c.accountsDue) badges.push({ text: deadlineText('Accounts', c.accountsDue, c.accountsOverdue), color: deadlineColor(c.accountsDue, c.accountsOverdue) });
  if (show.confirmation && c.csDue) badges.push({ text: deadlineText('Conf. stmt', c.csDue, c.csOverdue), color: deadlineColor(c.csDue, c.csOverdue) });
  if (show.ctPayment && c.ctPaymentDue) badges.push({ text: deadlineText('CT pay', c.ctPaymentDue), color: deadlineColor(c.ctPaymentDue) });
  if (show.ctReturn && c.ctReturnDue) badges.push({ text: deadlineText('CT600', c.ctReturnDue), color: deadlineColor(c.ctReturnDue) });
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
