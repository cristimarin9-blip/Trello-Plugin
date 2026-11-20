// Board modal for Fields: Table view, Add/edit fields, and Import.
import { initIframe } from '../lib/iframe.js';
import { api, NeedsAuthError, loadContext } from '../lib/fields.js';
import { authorize } from '../lib/trello-api.js';
import { byId, clear, el, setStatus } from '../lib/util.js';
import { drawManage } from './fields-manage.js';
import { drawTable } from './fields-table.js';
import { drawImport } from './fields-import.js';

const t = initIframe();
const app = byId('app');
const TABS = [['table', '▦ Table view'], ['manage', '✎ Add / edit fields'], ['import', '⇪ Import']];
const requested = t.arg('tab');
let active = TABS.some(([id]) => id === requested) ? requested : 'table';

const nav = el('div', { class: 'tabs big' });
const body = el('div', { class: 'fb-body' });
app.append(nav, body);

// Shared state for the three tabs.
const ctx = {
  t,
  boardId: null,
  board: null,      // { fields, updatedAt, views, cards }
  trello: null,     // { cards, lists, members }
  dirty: false,     // unsaved field edits in Manage
  go: (tab) => { active = tab; render(); },
  async reload() {
    ctx.board = await api.board(t, ctx.boardId);
    return ctx.board;
  }
};

function drawNav() {
  clear(nav);
  for (const [id, label] of TABS) {
    nav.append(el('button', { class: id === active ? 'active' : '', role: 'tab', 'aria-selected': String(id === active), onclick: () => {
      if (id === active) return;
      if (active === 'manage' && ctx.dirty) { setStatus('You have unsaved field changes: save them or discard them first', 'error'); return; }
      active = id; render();
    } }, label));
  }
}

async function render() {
  drawNav();
  clear(body);
  setStatus('');
  try {
    if (!ctx.boardId) ctx.boardId = (await t.board('id')).id;
    if (!ctx.trello) {
      const [cards, lists] = await Promise.all([t.cards('id', 'name', 'idList', 'url', 'members', 'closed', 'idShort', 'dateLastActivity', 'due', 'badges'), t.lists('id', 'name')]);
      ctx.trello = { cards: cards.filter((c) => !c.closed), lists };
    }
    if (!ctx.board) await ctx.reload();
    ctx.fieldCtx = await loadContext(t, ctx.board.fields || [], { boardId: ctx.boardId, cards: ctx.trello.cards });
    if (active === 'table') await drawTable(body, ctx);
    else if (active === 'manage') drawManage(body, ctx);
    else drawImport(body, ctx);
  } catch (err) {
    if (err instanceof NeedsAuthError) {
      body.append(el('div', { class: 'empty-state' }, el('p', {}, 'Fields are stored by Keel, so Keel needs your permission first.'),
        el('button', { class: 'primary', onclick: async () => { try { await authorize(t); ctx.board = null; render(); } catch (e) { setStatus(e.message || 'Cancelled', 'error'); } } }, 'Authorise')));
    } else {
      body.append(el('p', { class: 'status error' }, err.message || String(err)));
    }
  }
}

// Redraw when pluginData changes (e.g. someone else saved the fields), but never over
// unsaved edits, and not for the change markers this window wrote itself.
ctx.selfWriteAt = 0;
let first = true;
t.render(() => {
  if (first) { first = false; return render(); }
  if (ctx.dirty || Date.now() - ctx.selfWriteAt < 5000) return null;
  ctx.board = null;
  return render();
});
