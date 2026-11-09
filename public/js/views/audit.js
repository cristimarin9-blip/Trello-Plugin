// Modal: activity audit — board visits, who viewed what, scheduled-action log.
import { KEYS } from '../config.js';
import { initIframe } from '../lib/iframe.js';
import { get, remove } from '../lib/storage.js';
import { byId, clear, el, formatDateTime, relativeTime, truncate } from '../lib/util.js';

const t = initIframe();
const app = byId('app');

async function render() {
  clear(app);
  const [audit, log, cards, board] = await Promise.all([get(t, 'board', KEYS.audit), get(t, 'board', KEYS.scheduleLog, []), t.cards('id', 'name'), t.board('members')]);
  const members = audit ? Object.entries(audit.members || {}).sort((a, b) => b[1].last - a[1].last) : [];
  const nameOf = (id) => (audit && audit.members[id] && audit.members[id].n) || (board.members.find((m) => m.id === id) || {}).fullName || id;

  app.append(el('p', { class: 'notice' }, 'Trello does not expose log-in events to Power-Ups. This audit records when a member loads this board or opens a card while the Power-Up is enabled (at most once per 15 min per member for the board, 5 min per card). Members who have not enabled the Power-Up in their browser are not recorded.'));

  app.append(el('h3', {}, 'Board members — last active here'));
  const table = el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Member'), el('th', {}, 'Last seen'), el('th', {}, 'First seen'), el('th', {}, 'Visits'))));
  const tbody = el('tbody');
  const seen = new Set(members.map(([id]) => id));
  for (const [, m] of members) tbody.append(el('tr', {}, el('td', {}, m.n, ' ', el('small', { class: 'muted' }, `@${m.u}`)), el('td', { title: formatDateTime(m.last) }, relativeTime(m.last)), el('td', {}, formatDateTime(m.first)), el('td', {}, String(m.v))));
  for (const m of board.members.filter((x) => !seen.has(x.id))) tbody.append(el('tr', {}, el('td', {}, m.fullName, ' ', el('small', { class: 'muted' }, `@${m.username}`)), el('td', { class: 'muted' }, 'never (with Power-Up)'), el('td'), el('td', {}, '0')));
  table.append(tbody);
  app.append(table);

  if (audit && audit.log && audit.log.length) {
    app.append(el('h3', { style: 'margin-top:12px' }, 'Recent board visits'));
    app.append(el('ul', { class: 'log' }, audit.log.map((e) => el('li', {}, el('small', { class: 'muted' }, formatDateTime(e.at)), ` — ${nameOf(e.m)} opened the board`))));
  }

  // Recently viewed cards across the board
  const views = await Promise.all(cards.map((c) => get(t, c.id, KEYS.views)));
  const recent = cards.map((c, i) => ({ card: c, views: views[i] })).filter((x) => x.views && x.views.total)
    .map((x) => { const last = Object.values(x.views.viewers).sort((a, b) => b.at - a.at)[0]; return { ...x, last }; })
    .sort((a, b) => b.last.at - a.last.at).slice(0, 25);
  if (recent.length) {
    app.append(el('h3', { style: 'margin-top:12px' }, 'Recently viewed cards'));
    const vt = el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Card'), el('th', {}, 'Last viewed by'), el('th', {}, 'When'), el('th', {}, 'Total views'))));
    const vb = el('tbody');
    for (const r of recent) vb.append(el('tr', { class: 'clickable', onclick: () => t.showCard(r.card.id) }, el('td', {}, truncate(r.card.name, 50)), el('td', {}, r.last.n), el('td', {}, relativeTime(r.last.at)), el('td', {}, String(r.views.total))));
    vt.append(vb); app.append(vt);
  }

  if (log && log.length) {
    app.append(el('h3', { style: 'margin-top:12px' }, 'Scheduled actions executed'));
    app.append(el('ul', { class: 'log' }, log.map((e) => el('li', {}, el('small', { class: 'muted' }, formatDateTime(e.at)), ` — ${e.what} on “${e.card}” ${e.ok ? '✓' : `✗ ${e.err || ''}`}`))));
  }

  app.append(el('p', { style: 'margin-top:12px' }, el('button', { class: 'small', onclick: async () => { if (window.confirm('Clear the board visit log?')) { await remove(t, 'board', KEYS.audit); render(); } } }, 'Clear board visit log')));
}
t.render(render);
