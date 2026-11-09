// Card-back tab: checklist sub-points and ordering.
// Trello checklists are flat, so a sub-point is an item whose name starts with
// one "↳ " per level. This tab renders them indented and numbered (1, 1.1, 1.2…)
// and lets you move, indent/outdent, tick and add items via the REST API.
import { cards as cardsApi, checklists as checklistsApi, isAuthorized } from '../lib/trello-api.js';
import { el, setStatus } from '../lib/util.js';

export const MARK = '↳ ';

export function depthOf(name) {
  let d = 0;
  let rest = name;
  while (rest.startsWith(MARK)) { d += 1; rest = rest.slice(MARK.length); }
  return { depth: d, text: rest };
}

export function withDepth(text, depth) {
  return MARK.repeat(Math.max(0, depth)) + text;
}

/** Hierarchical numbering for a flat list of {depth}. */
export function numberItems(items) {
  const counters = [];
  return items.map((item) => {
    counters.length = item.depth + 1;
    counters[item.depth] = (counters[item.depth] || 0) + 1;
    for (let i = 0; i < item.depth; i += 1) if (!counters[i]) counters[i] = 1;
    return counters.join('.');
  });
}

function positionBetween(before, after) {
  if (!before && !after) return 'bottom';
  if (!before) return 'top';
  if (!after) return 'bottom';
  return (before.pos + after.pos) / 2;
}

async function authNotice(t, root) {
  if (await isAuthorized(t)) return true;
  root.append(el('p', { class: 'notice' }, 'Authorise the Power-Up (Power-Up menu → settings → Authorise) to manage checklists.'));
  return false;
}

export default {
  id: 'checklist',
  label: 'Checklist',
  async render(t, root, ctx) {
    if (!(await authNotice(t, root))) return;
    const card = await t.card('id');
    const checklists = await cardsApi.checklists(t, card.id);
    checklists.sort((a, b) => a.pos - b.pos);
    if (!checklists.length) root.append(el('p', { class: 'muted' }, 'No checklists on this card yet. Add one in Trello, or apply a routine.'));

    const act = async (fn, okMessage) => {
      try { await fn(); if (okMessage) setStatus(okMessage, 'success'); await ctx.refresh(); } catch (err) { setStatus(err.message, 'error'); }
    };

    for (const checklist of checklists) {
      const items = [...(checklist.checkItems || [])].sort((a, b) => a.pos - b.pos).map((i) => ({ ...i, ...depthOf(i.name) }));
      const numbers = numberItems(items);
      const done = items.filter((i) => i.state === 'complete').length;
      root.append(el('h3', {}, `${checklist.name} `, el('small', {}, `${done}/${items.length}`)));
      const container = el('div');
      items.forEach((item, i) => {
        const row = el('div', { class: `check-item${item.state === 'complete' ? ' done' : ''}`, style: `padding-left:${item.depth * 18}px` });
        const tick = el('input', { type: 'checkbox', checked: item.state === 'complete', onchange: () => act(() => cardsApi.updateCheckItem(t, card.id, item.id, { state: tick.checked ? 'complete' : 'incomplete' })) });
        const tools = el('span', { class: 'tools' },
          el('button', { class: 'icon', title: 'Move up', disabled: i === 0, onclick: () => act(() => cardsApi.updateCheckItem(t, card.id, item.id, { pos: positionBetween(items[i - 2], items[i - 1]) })) }, '▲'),
          el('button', { class: 'icon', title: 'Move down', disabled: i === items.length - 1, onclick: () => act(() => cardsApi.updateCheckItem(t, card.id, item.id, { pos: positionBetween(items[i + 1], items[i + 2]) })) }, '▼'),
          el('button', { class: 'icon', title: 'Outdent', disabled: item.depth === 0, onclick: () => act(() => cardsApi.updateCheckItem(t, card.id, item.id, { name: withDepth(item.text, item.depth - 1) })) }, '⇤'),
          el('button', { class: 'icon', title: 'Indent (make sub-point)', disabled: i === 0 || item.depth >= 3, onclick: () => act(() => cardsApi.updateCheckItem(t, card.id, item.id, { name: withDepth(item.text, item.depth + 1) })) }, '⇥'),
          el('button', { class: 'icon', title: 'Add sub-point below', onclick: () => {
            const text = window.prompt(`Sub-point under "${item.text}":`);
            if (!text) return;
            // Insert after this item's subtree.
            let j = i + 1;
            while (j < items.length && items[j].depth > item.depth) j += 1;
            act(() => checklistsApi.addItem(t, checklist.id, withDepth(text.trim(), item.depth + 1), positionBetween(items[j - 1], items[j])), 'Sub-point added');
          } }, '+'),
          el('button', { class: 'icon', title: 'Delete', onclick: () => { if (window.confirm(`Delete "${item.text}"?`)) act(() => checklistsApi.deleteItem(t, checklist.id, item.id)); } }, '✕')
        );
        row.append(tick, el('span', { class: 'num' }, numbers[i]), el('span', { class: 'name' }, item.text), tools);
        container.append(row);
      });
      const add = el('input', { type: 'text', placeholder: 'Add item… (start with ↳ for a sub-point)' });
      add.onkeydown = (e) => {
        if (e.key === 'Enter' && add.value.trim()) act(() => checklistsApi.addItem(t, checklist.id, add.value.trim()), 'Item added');
      };
      container.append(el('div', { style: 'margin:4px 0 10px' }, add));
      root.append(container);
    }
    root.append(el('p', { class: 'muted' }, el('small', {}, 'Hover an item for move / indent / sub-point tools. Sub-points are stored as "↳ " prefixes so they also read correctly in Trello\'s own checklist view.')));
  }
};
