// Card-back tab (and popup): parent task <-> subtask cards.
import { KEYS } from '../config.js';
import { get, set, remove } from '../lib/storage.js';
import { cards as cardsApi, isAuthorized } from '../lib/trello-api.js';
import { el, clear, setStatus, truncate } from '../lib/util.js';

async function link(t, parentId, parentName, childId) {
  const children = (await get(t, parentId, KEYS.children)) || [];
  if (!children.includes(childId)) children.push(childId);
  await Promise.all([
    set(t, parentId, KEYS.children, children),
    set(t, childId, KEYS.parent, { id: parentId, name: parentName })
  ]);
}

async function unlink(t, parentId, childId) {
  const children = ((await get(t, parentId, KEYS.children)) || []).filter((id) => id !== childId);
  await Promise.all([
    children.length ? set(t, parentId, KEYS.children, children) : remove(t, parentId, KEYS.children),
    remove(t, childId, KEYS.parent)
  ]);
}

function cardPicker(t, allCards, excludeIds, onPick, placeholder) {
  const wrap = el('div');
  const input = el('input', { type: 'search', placeholder });
  const results = el('ul', { class: 'card-list' });
  const update = () => {
    clear(results);
    const q = input.value.trim().toLowerCase();
    if (!q) return;
    allCards.filter((c) => !excludeIds.has(c.id) && c.name.toLowerCase().includes(q)).slice(0, 8)
      .forEach((c) => results.append(el('li', { onclick: () => onPick(c) }, el('span', { class: 'grow' }, truncate(c.name, 48)), el('small', {}, c.listName))));
  };
  input.oninput = update;
  wrap.append(input, results);
  return wrap;
}

export default {
  id: 'subtasks',
  label: 'Subtasks',
  async render(t, root, ctx) {
    const [card, parent, children, boardCards, lists] = await Promise.all([
      t.card('id', 'name', 'idList'),
      get(t, 'card', KEYS.parent),
      get(t, 'card', KEYS.children, []),
      t.cards('id', 'name', 'idList', 'dueComplete'),
      t.lists('id', 'name')
    ]);
    const listName = new Map(lists.map((l) => [l.id, l.name]));
    const all = boardCards.map((c) => ({ ...c, listName: listName.get(c.idList) || '' }));
    const byId = new Map(all.map((c) => [c.id, c]));
    const exclude = new Set([card.id, ...(children || []), parent ? parent.id : null].filter(Boolean));

    // Parent
    root.append(el('h3', {}, 'Parent task'));
    if (parent && parent.id) {
      root.append(el('div', { class: 'row between' },
        el('a', { href: '#', onclick: (e) => { e.preventDefault(); t.showCard(parent.id); } }, truncate((byId.get(parent.id) || parent).name, 50)),
        el('button', { class: 'small', onclick: async () => { await unlink(t, parent.id, card.id); ctx.refresh(); } }, 'Unlink')));
    } else {
      root.append(cardPicker(t, all, exclude, async (p) => { await link(t, p.id, p.name, card.id); setStatus(`Now a subtask of "${truncate(p.name, 30)}"`, 'success'); ctx.refresh(); }, 'Search a card to make this a subtask of…'));
    }

    // Children
    root.append(el('h3', { style: 'margin-top:10px' }, `Subtasks (${(children || []).length})`));
    const list = el('ul', { class: 'card-list' });
    for (const id of children || []) {
      const c = byId.get(id);
      list.append(el('li', {},
        el('span', { class: `pill ${c ? (c.dueComplete ? 'green' : 'light-gray') : 'light-gray'}` }, c ? (c.dueComplete ? 'done' : 'open') : 'archived'),
        el('a', { class: 'grow', href: '#', onclick: (e) => { e.preventDefault(); t.showCard(id); } }, c ? truncate(c.name, 44) : id),
        c ? el('small', {}, c.listName) : null,
        el('button', { class: 'small', onclick: async () => { await unlink(t, card.id, id); ctx.refresh(); } }, 'Unlink')));
    }
    root.append(list);
    root.append(el('p', { class: 'muted' }, el('small', {}, 'A subtask counts as done when its due date is marked complete.')));

    root.append(cardPicker(t, all, exclude, async (c) => { await link(t, card.id, card.name, c.id); ctx.refresh(); }, 'Link an existing card as a subtask…'));

    // Create a new subtask card (needs REST access)
    const name = el('input', { type: 'text', placeholder: 'New subtask name' });
    const create = el('button', { class: 'primary' }, 'Create');
    create.onclick = async () => {
      if (!name.value.trim()) return;
      if (!(await isAuthorized(t))) return setStatus('Authorise the Power-Up (settings) to create cards.', 'error');
      create.disabled = true;
      try {
        const created = await cardsApi.create(t, { idList: card.idList, name: `${name.value.trim()}`, pos: 'bottom' });
        await link(t, card.id, card.name, created.id);
        name.value = '';
        setStatus('Subtask created', 'success');
        ctx.refresh();
      } catch (err) { setStatus(err.message, 'error'); } finally { create.disabled = false; }
    };
    name.onkeydown = (e) => { if (e.key === 'Enter') create.click(); };
    root.append(el('div', { class: 'row', style: 'margin-top:6px' }, el('div', { class: 'grow' }, name), create));
  }
};
