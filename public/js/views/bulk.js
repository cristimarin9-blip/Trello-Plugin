// Modal: bulk card actions.
import { KEYS } from '../config.js';
import { initIframe } from '../lib/iframe.js';
import { set, remove } from '../lib/storage.js';
import { cards as cardsApi, isAuthorized, hasAppKey } from '../lib/trello-api.js';
import { ORDER, PRIORITIES } from '../features/priority.js';
import { FEATURES, boardDefaults, setCardFeature, setCardFeatures } from '../lib/features.js';
import { byId, clear, el, setStatus, truncate, formatDate } from '../lib/util.js';

const t = initIframe();
const app = byId('app');
const selected = new Set();
let cards = [];
let lists = [];
let board = { labels: [], members: [] };

const search = el('input', { type: 'search', placeholder: 'Filter cards by name…' });
const listFilter = el('select', {});
const picker = el('div', { class: 'scroll', style: 'max-height:55vh' });
const actionSel = el('select', {}, [
  ['move', 'Move to list…'], ['archive', 'Archive'], ['label', 'Add label…'], ['member', 'Add member…'],
  ['due', 'Set due date…'], ['priority', 'Set priority…'], ['clearPriority', 'Clear priority'], ['complete', 'Mark due complete'],
  ['featureOn', 'Turn feature ON…'], ['featureOff', 'Turn feature OFF…'], ['featureReset', 'Reset features to board defaults']
].map(([v, l]) => el('option', { value: v }, l)));
const NO_REST = ['priority', 'clearPriority', 'featureOn', 'featureOff', 'featureReset'];
let defaults = null;
const extra = el('div');
const apply = el('button', { class: 'primary' }, 'Apply to 0 cards');
const progress = el('div', { class: 'muted' });

app.append(
  el('div', { class: 'row' }, el('div', { class: 'grow' }, search), listFilter,
    el('button', { class: 'small', onclick: () => { visibleCards().forEach((c) => selected.add(c.id)); renderPicker(); } }, 'Select visible'),
    el('button', { class: 'small', onclick: () => { selected.clear(); renderPicker(); } }, 'Clear')),
  picker,
  el('h3', { style: 'margin-top:10px' }, 'Action'),
  el('div', { class: 'row' }, actionSel, extra, apply),
  progress
);

function visibleCards() {
  const q = search.value.trim().toLowerCase();
  const l = listFilter.value;
  return cards.filter((c) => (!l || c.idList === l) && (!q || c.name.toLowerCase().includes(q)));
}

function renderPicker() {
  clear(picker);
  const listName = new Map(lists.map((l) => [l.id, l.name]));
  const table = el('table');
  const tbody = el('tbody');
  for (const c of visibleCards()) {
    const cb = el('input', { type: 'checkbox', checked: selected.has(c.id), onchange: () => { if (cb.checked) selected.add(c.id); else selected.delete(c.id); updateApply(); } });
    tbody.append(el('tr', {}, el('td', { style: 'width:28px' }, cb), el('td', {}, truncate(c.name, 70)), el('td', {}, el('small', { class: 'muted' }, listName.get(c.idList) || '')), el('td', {}, c.due ? el('small', {}, formatDate(c.due)) : '')));
  }
  table.append(tbody);
  picker.append(table);
  updateApply();
}

function updateApply() { apply.textContent = `Apply to ${selected.size} card${selected.size === 1 ? '' : 's'}`; apply.disabled = !selected.size; }

function renderExtra() {
  clear(extra);
  const v = actionSel.value;
  if (v === 'move') extra.append(el('select', { id: 'opt' }, lists.map((l) => el('option', { value: l.id }, l.name))));
  if (v === 'label') extra.append(el('select', { id: 'opt' }, board.labels.map((l) => el('option', { value: l.id }, l.name || l.color))));
  if (v === 'member') extra.append(el('select', { id: 'opt' }, board.members.map((m) => el('option', { value: m.id }, m.fullName))));
  if (v === 'due') extra.append(el('input', { id: 'opt', type: 'date' }));
  if (v === 'priority') extra.append(el('select', { id: 'opt' }, ORDER.map((p) => el('option', { value: p }, PRIORITIES[p].label))));
  if (v === 'featureOn' || v === 'featureOff') extra.append(el('select', { id: 'opt' }, FEATURES.map((f) => el('option', { value: f.id }, f.label))));
}

async function runOne(cardId, action, value) {
  switch (action) {
    case 'move': return cardsApi.update(t, cardId, { idList: value, pos: 'bottom' });
    case 'archive': return cardsApi.update(t, cardId, { closed: true });
    case 'label': return cardsApi.addLabel(t, cardId, value);
    case 'member': return cardsApi.addMember(t, cardId, value);
    case 'due': return cardsApi.update(t, cardId, { due: new Date(`${value}T17:00:00`).toISOString() });
    case 'complete': return cardsApi.update(t, cardId, { dueComplete: true });
    case 'priority': return set(t, cardId, KEYS.priority, value);
    case 'clearPriority': return remove(t, cardId, KEYS.priority);
    case 'featureOn': return setCardFeature(t, cardId, value, true, defaults);
    case 'featureOff': return setCardFeature(t, cardId, value, false, defaults);
    case 'featureReset': return setCardFeatures(t, cardId, null);
    default: throw new Error(`Unknown action ${action}`);
  }
}

apply.onclick = async () => {
  const action = actionSel.value;
  const opt = byId('opt');
  const value = opt ? opt.value : null;
  if (['move', 'label', 'member', 'due', 'priority', 'featureOn', 'featureOff'].includes(action) && !value) return setStatus('Choose a value first', 'error');
  const needsRest = !NO_REST.includes(action);
  if (needsRest && !(await isAuthorized(t))) return setStatus(hasAppKey() ? 'Authorise the Power-Up first (Power-Up menu → settings).' : 'APP_KEY not set in config.js (README step 3).', 'error');
  if (!window.confirm(`${actionSel.selectedOptions[0].textContent} on ${selected.size} cards?`)) return;
  apply.disabled = true;
  defaults = await boardDefaults(t);
  let ok = 0; let failed = 0;
  const ids = [...selected];
  for (let i = 0; i < ids.length; i += 1) {
    progress.textContent = `Working… ${i + 1}/${ids.length}`;
    try { await runOne(ids[i], action, value); ok += 1; } catch (err) { failed += 1; console.warn(err); }
  }
  progress.textContent = '';
  setStatus(`Done: ${ok} updated${failed ? `, ${failed} failed (see console)` : ''}`, failed ? 'error' : 'success');
  selected.clear();
  await load();
};

async function load() {
  [cards, lists, board] = await Promise.all([t.cards('id', 'name', 'idList', 'due'), t.lists('id', 'name'), t.board('labels', 'members')]);
  clear(listFilter);
  listFilter.append(el('option', { value: '' }, 'All lists'), ...lists.map((l) => el('option', { value: l.id }, l.name)));
  renderPicker();
  renderExtra();
}
search.oninput = renderPicker; listFilter.onchange = renderPicker; actionSel.onchange = renderExtra;
t.render(load);
