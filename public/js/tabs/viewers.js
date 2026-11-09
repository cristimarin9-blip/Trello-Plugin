// Card-back tab: who viewed this card and when.
import { KEYS } from '../config.js';
import { get, remove } from '../lib/storage.js';
import { el, formatDateTime, relativeTime } from '../lib/util.js';

export default {
  id: 'viewers',
  label: 'Who viewed',
  async render(t, root, ctx) {
    const views = await get(t, 'card', KEYS.views);
    const viewers = views ? Object.entries(views.viewers || {}).sort((a, b) => b[1].at - a[1].at) : [];
    if (!viewers.length) {
      root.append(el('p', { class: 'muted' }, 'No views recorded yet. Views are recorded when a member opens this card while the Power-Up is enabled.'));
      return;
    }
    const table = el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Member'), el('th', {}, 'Last viewed'), el('th', {}, 'Times'))));
    const tbody = el('tbody');
    for (const [, v] of viewers) {
      tbody.append(el('tr', {}, el('td', {}, v.n, ' ', el('small', { class: 'muted' }, `@${v.u}`)), el('td', { title: formatDateTime(v.at) }, relativeTime(v.at)), el('td', {}, String(v.c))));
    }
    table.append(tbody);
    root.append(
      el('p', { class: 'muted' }, `${views.total} views by ${viewers.length} ${viewers.length === 1 ? 'person' : 'people'}.`),
      table,
      el('p', {}, el('button', { class: 'small', onclick: async () => { await remove(t, 'card', KEYS.views); ctx.refresh(); } }, 'Clear view log')),
      el('p', { class: 'notice' }, 'Trello does not expose real "card viewed" events. This log only counts members who open the card with this Power-Up enabled, at most once per 5 minutes each.')
    );
  }
};
