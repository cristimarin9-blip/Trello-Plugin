// Popup: scheduled actions / temporary card.
import { KEYS } from '../config.js';
import { initIframe, fit } from '../lib/iframe.js';
import { get, set, remove } from '../lib/storage.js';
import { isAuthorized } from '../lib/trello-api.js';
import { ORDER, PRIORITIES } from '../features/priority.js';
import { describe } from '../features/scheduler.js';
import { byId, clear, el, formatDateTime, uid, setStatus } from '../lib/util.js';

const t = initIframe();
const app = byId('app');
const mode = t.arg('mode') || 'actions';

function toLocalInput(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function addItem(item) {
  const schedule = (await get(t, 'card', KEYS.schedule)) || [];
  const next = item.temp ? schedule.filter((s) => !s.temp) : schedule;
  next.push({ id: uid(), ...item });
  await set(t, 'card', KEYS.schedule, next);
}

async function removeItem(id) {
  const schedule = ((await get(t, 'card', KEYS.schedule)) || []).filter((s) => s.id !== id);
  await (schedule.length ? set(t, 'card', KEYS.schedule, schedule) : remove(t, 'card', KEYS.schedule));
}

async function render() {
  clear(app);
  const [schedule, lists, authed] = await Promise.all([get(t, 'card', KEYS.schedule, []), t.lists('id', 'name'), isAuthorized(t)]);
  const existing = (schedule || []).filter((s) => (mode === 'temp' ? s.temp : true)).sort((a, b) => a.at - b.at);

  if (existing.length) {
    app.append(el('h3', {}, mode === 'temp' ? 'Expiry' : 'Scheduled'));
    app.append(el('ul', { class: 'card-list' }, existing.map((s) => el('li', {},
      el('span', { class: 'grow' }, `${describe(s)} · ${formatDateTime(s.at)}`),
      el('button', { class: 'small', onclick: async () => { await removeItem(s.id); render(); } }, 'Cancel')))));
  }

  if (mode === 'temp') {
    app.append(el('h3', {}, 'Archive this card automatically'));
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 0, 0);
    const quick = [
      ['End of today', endOfDay.getTime()],
      ['In 24 hours', Date.now() + 24 * 3600e3],
      ['In 3 days', Date.now() + 3 * 24 * 3600e3],
      ['In 7 days', Date.now() + 7 * 24 * 3600e3]
    ];
    app.append(el('div', { class: 'row' }, quick.map(([label, at]) => el('button', { onclick: async () => { await addItem({ type: 'archive', temp: true, at }); render(); } }, label))));
    const custom = el('input', { type: 'datetime-local', value: toLocalInput(Date.now() + 24 * 3600e3) });
    app.append(el('label', {}, 'Or pick a date and time'), el('div', { class: 'row' }, el('div', { class: 'grow' }, custom),
      el('button', { class: 'primary', onclick: async () => { const at = new Date(custom.value).getTime(); if (!at) return; await addItem({ type: 'archive', temp: true, at }); render(); } }, 'Set expiry')));
  } else {
    app.append(el('h3', {}, 'Add a scheduled action'));
    const type = el('select', {}, [['archive', 'Archive the card'], ['move', 'Move to list…'], ['complete', 'Mark due date complete'], ['priority', 'Set priority…']].map(([v, l]) => el('option', { value: v }, l)));
    const listSel = el('select', {}, lists.map((l) => el('option', { value: l.id }, l.name)));
    const prioSel = el('select', {}, ORDER.map((p) => el('option', { value: p }, PRIORITIES[p].label)));
    const when = el('input', { type: 'datetime-local', value: toLocalInput(Date.now() + 24 * 3600e3) });
    const extra = el('div');
    const updateExtra = () => { clear(extra); if (type.value === 'move') extra.append(el('label', {}, 'List'), listSel); if (type.value === 'priority') extra.append(el('label', {}, 'Priority'), prioSel); };
    type.onchange = () => { updateExtra(); fit(t); };
    updateExtra();
    app.append(el('label', {}, 'Action'), type, extra, el('label', {}, 'When'), when,
      el('p', {}, el('button', { class: 'primary', onclick: async () => {
        const at = new Date(when.value).getTime();
        if (!at) return setStatus('Pick a date and time', 'error');
        const item = { type: type.value, at };
        if (item.type === 'move') { item.listId = listSel.value; item.listName = listSel.selectedOptions[0].textContent; }
        if (item.type === 'priority') item.value = prioSel.value;
        await addItem(item);
        setStatus('Scheduled', 'success');
        render();
      } }, 'Schedule')));
  }
  app.append(el('p', { class: 'notice' }, authed
    ? 'Actions run when any board member with this Power-Up opens the board after the due time (checked once a minute). For exact-time execution use Trello Automation (Butler).'
    : 'Nobody has authorised the Power-Up yet: scheduled actions cannot run until someone does (Power-Up menu → settings → Authorise).'));
  fit(t, 160);
}
t.render(render);
