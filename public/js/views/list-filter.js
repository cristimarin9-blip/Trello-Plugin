// Popup: filter cards within a single list.
import { KEYS } from '../config.js';
import { initIframe, fit } from '../lib/iframe.js';
import { get } from '../lib/storage.js';
import { ORDER, PRIORITIES } from '../features/priority.js';
import { byId, clear, el, formatDate, truncate } from '../lib/util.js';

const t = initIframe();
const app = byId('app');
const listId = t.arg('listId');

const search = el('input', { type: 'search', placeholder: 'Type to filter cards in this list…', autofocus: true });
const prio = el('select', {}, el('option', { value: '' }, 'Any priority'), ORDER.map((p) => el('option', { value: p }, PRIORITIES[p].label)));
const results = el('ul', { class: 'card-list' });
const count = el('small', { class: 'muted' });
app.append(el('div', { class: 'row' }, el('div', { class: 'grow' }, search), prio), results, count);

let cards = [];
async function load() {
  const all = await t.cards('id', 'name', 'idList', 'due', 'labels', 'members');
  const mine = all.filter((c) => c.idList === listId);
  const priorities = await Promise.all(mine.map((c) => get(t, c.id, KEYS.priority)));
  cards = mine.map((c, i) => ({ ...c, priority: priorities[i] }));
  update();
}

function update() {
  clear(results);
  const q = search.value.trim().toLowerCase();
  const p = prio.value;
  const matches = cards.filter((c) => (!p || c.priority === p) && (!q || c.name.toLowerCase().includes(q) || (c.labels || []).some((l) => (l.name || '').toLowerCase().includes(q)) || (c.members || []).some((m) => (m.fullName || '').toLowerCase().includes(q))));
  for (const c of matches.slice(0, 50)) {
    results.append(el('li', { onclick: () => t.showCard(c.id) },
      c.priority ? el('span', { class: `pill ${PRIORITIES[c.priority].color}` }, PRIORITIES[c.priority].label) : null,
      el('span', { class: 'grow' }, truncate(c.name, 60)),
      (c.labels || []).slice(0, 3).map((l) => el('span', { class: `pill ${l.color || 'light-gray'}` }, l.name || l.color)),
      c.due ? el('small', {}, formatDate(c.due)) : null));
  }
  count.textContent = `${matches.length} of ${cards.length} cards`;
  fit(t, 120);
}
search.oninput = update;
prio.onchange = update;
search.focus();
t.render(load);
