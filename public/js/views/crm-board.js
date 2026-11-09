// Modal: every client card's stages at a glance.
import { KEYS } from '../config.js';
import { initIframe } from '../lib/iframe.js';
import { get } from '../lib/storage.js';
import { TRACKS, TRACK_ORDER, summarize } from '../features/crm.js';
import { PRIORITIES } from '../features/priority.js';
import { byId, clear, el, formatDate, daysUntil, deadlineColor, truncate } from '../lib/util.js';

const t = initIframe();
const app = byId('app');

const search = el('input', { type: 'search', placeholder: 'Search client…' });
const trackFilter = el('select', {}, el('option', { value: '' }, 'All tracks'), TRACK_ORDER.map((k) => el('option', { value: k }, TRACKS[k].label)));
const hideDone = el('input', { type: 'checkbox', checked: true });
const summary = el('div', { class: 'row', style: 'margin:6px 0' });
const tableWrap = el('div', { class: 'scroll' });
app.append(
  el('div', { class: 'row' }, el('div', { class: 'grow' }, search), trackFilter, el('label', { class: 'row', style: 'margin:0;text-transform:none' }, hideDone, ' Hide completed'),
    el('button', { onclick: () => exportCsv() }, 'Export CSV')),
  summary, tableWrap
);

let rows = [];

async function load() {
  const [cards, lists] = await Promise.all([t.cards('id', 'name', 'idList', 'due'), t.lists('id', 'name')]);
  const listName = new Map(lists.map((l) => [l.id, l.name]));
  const data = await Promise.all(cards.map((c) => Promise.all([get(t, c.id, KEYS.crm), get(t, c.id, KEYS.company), get(t, c.id, KEYS.priority)])));
  rows = cards.map((c, i) => {
    const [crm, company, priority] = data[i];
    return { card: c, list: listName.get(c.idList) || '', crm: crm || {}, company, priority, tracks: summarize(crm, company) };
  }).filter((r) => r.tracks.length || r.company);
  update();
}

function cell(r, key) {
  const s = r.tracks.find((x) => x.key === key);
  if (!s) return el('td', { class: 'muted' }, '—');
  return el('td', {}, el('span', { class: `pill ${s.color || 'light-gray'}` }, s.stage), s.due ? el('div', {}, el('small', { class: 'muted' }, `due ${formatDate(s.due, { year: undefined })}`)) : null);
}

function visible() {
  const q = search.value.trim().toLowerCase();
  const tk = trackFilter.value;
  return rows.filter((r) => (!q || r.card.name.toLowerCase().includes(q) || (r.company && (r.company.name || '').toLowerCase().includes(q)))
    && (!tk || r.tracks.some((s) => s.key === tk))
    && (!hideDone.checked || r.tracks.some((s) => !s.final) || !r.tracks.length));
}

function update() {
  clear(tableWrap); clear(summary);
  const list = visible();
  const overdue = list.filter((r) => r.tracks.some((s) => s.color === 'red') || (r.company && (r.company.accountsOverdue || r.company.csOverdue))).length;
  const dueSoon = list.filter((r) => r.tracks.some((s) => s.color === 'orange')).length;
  summary.append(el('span', { class: 'pill blue' }, `${list.length} clients`), el('span', { class: 'pill red' }, `${overdue} overdue`), el('span', { class: 'pill orange' }, `${dueSoon} due within 14 days`));
  const table = el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Client'), el('th', {}, 'List'), TRACK_ORDER.map((k) => el('th', {}, TRACKS[k].short)), el('th', {}, 'Companies House'), el('th', {}, 'Priority'))));
  const tbody = el('tbody');
  for (const r of list) {
    const ch = r.company ? el('div', {},
      r.company.accountsDue ? el('div', {}, el('span', { class: `badge-dot pill ${deadlineColor(r.company.accountsDue, r.company.accountsOverdue)}` }), `Accounts ${formatDate(r.company.accountsDue, { year: undefined })}`) : null,
      r.company.csDue ? el('div', {}, el('span', { class: `badge-dot pill ${deadlineColor(r.company.csDue, r.company.csOverdue)}` }), `Conf. stmt ${formatDate(r.company.csDue, { year: undefined })}`) : null,
      r.company.status !== 'active' ? el('small', { class: 'status error' }, r.company.status) : null) : el('span', { class: 'muted' }, '—');
    tbody.append(el('tr', { class: 'clickable', onclick: () => t.showCard(r.card.id) },
      el('td', {}, el('strong', {}, truncate(r.card.name, 40)), r.company ? el('div', {}, el('small', { class: 'muted' }, `${r.company.number}`)) : null),
      el('td', {}, r.list),
      TRACK_ORDER.map((k) => cell(r, k)),
      el('td', {}, ch),
      el('td', {}, r.priority ? el('span', { class: `pill ${PRIORITIES[r.priority].color}` }, PRIORITIES[r.priority].label) : '')));
  }
  table.append(tbody);
  tableWrap.append(rows.length ? table : el('p', { class: 'muted' }, 'No client cards yet. Open a card → Practice Power-Up section → "Client stages" to start tracking one.'));
}

function exportCsv() {
  const head = ['Card', 'List', ...TRACK_ORDER.map((k) => `${TRACKS[k].label} stage`), ...TRACK_ORDER.map((k) => `${TRACKS[k].label} deadline`), 'Company number', 'Company name', 'Accounts due', 'Confirmation statement due', 'Priority'];
  const lines = [head];
  for (const r of visible()) {
    const stage = (k) => { const s = r.tracks.find((x) => x.key === k); return s ? s.stage : ''; };
    const due = (k) => { const s = r.tracks.find((x) => x.key === k); return s && s.due ? s.due : ''; };
    lines.push([r.card.name, r.list, ...TRACK_ORDER.map(stage), ...TRACK_ORDER.map(due), r.company ? r.company.number : '', r.company ? r.company.name : '', r.company ? r.company.accountsDue || '' : '', r.company ? r.company.csDue || '' : '', r.priority || '']);
  }
  const csv = lines.map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `client-crm-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
}

search.oninput = update; trackFilter.onchange = update; hideDone.onchange = update;
t.render(load);
