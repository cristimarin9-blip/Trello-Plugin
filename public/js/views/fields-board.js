// Board modal for Fields: a table of every card's values (sort, filter, CSV),
// the field editor, and the import scan for other Power-Ups' data (e.g. Amazing Fields).
import { initIframe } from '../lib/iframe.js';
import { api, TYPES, COLORS, newId, formatValue, csvCell, markBoardChanged, NeedsAuthError } from '../lib/fields.js';
import { api as trello, authorize } from '../lib/trello-api.js';
import { byId, clear, el, setStatus, truncate } from '../lib/util.js';

const t = initIframe();
const app = byId('app');
const TABS = [['table', 'Table'], ['manage', 'Manage fields'], ['import', 'Import']];
let active = TABS.some(([id]) => id === t.arg('tab')) ? t.arg('tab') : 'table';

const nav = el('div', { class: 'tabs' });
const body = el('div');
app.append(nav, body);

let boardId = null;
let board = null; // { fields, updatedAt, cards }

async function loadBoard() {
  if (!boardId) boardId = (await t.board('id')).id;
  board = await api.board(t, boardId);
  return board;
}

function drawNav() {
  clear(nav);
  for (const [id, label] of TABS) nav.append(el('button', { class: id === active ? 'active' : '', onclick: () => { active = id; render(); } }, label));
}

async function render() {
  drawNav();
  clear(body);
  setStatus('');
  try {
    if (!board) await loadBoard();
    if (active === 'table') await drawTable();
    else if (active === 'manage') drawManage();
    else drawImport();
  } catch (err) {
    if (err instanceof NeedsAuthError) {
      body.append(el('p', {}, 'Fields are stored by Keel, so Keel needs your permission first.'),
        el('button', { class: 'primary', onclick: async () => { try { await authorize(t); board = null; render(); } catch (e) { setStatus(e.message || 'Cancelled', 'error'); } } }, 'Authorise'));
    } else {
      body.append(el('p', { class: 'status error' }, err.message || String(err)));
    }
  }
}

// --- Table ------------------------------------------------------------------
const tableState = { q: '', list: '', withValues: true, sort: null, dir: 1 };

async function drawTable() {
  const fields = board.fields || [];
  if (!fields.length) {
    body.append(el('p', { class: 'muted' }, 'No fields yet.'), el('button', { class: 'primary', onclick: () => { active = 'manage'; render(); } }, 'Set up fields'));
    return;
  }
  const [cards, lists] = await Promise.all([t.cards('id', 'name', 'idList', 'url'), t.lists('id', 'name')]);
  const listName = new Map(lists.map((l) => [l.id, l.name]));
  const rows = cards.map((c) => ({ card: c, list: listName.get(c.idList) || '', values: (board.cards[c.id] && board.cards[c.id].values) || {} }));

  const search = el('input', { type: 'search', placeholder: 'Search cards and values…', value: tableState.q, oninput: () => { tableState.q = search.value; draw(); } });
  const listSel = el('select', { style: 'width:auto', onchange: () => { tableState.list = listSel.value; draw(); } },
    el('option', { value: '' }, 'All lists'), lists.map((l) => el('option', { value: l.id, selected: l.id === tableState.list }, l.name)));
  const withValues = el('input', { type: 'checkbox', checked: tableState.withValues, onchange: () => { tableState.withValues = withValues.checked; draw(); } });
  const summary = el('span', { class: 'pill blue' });
  const wrap = el('div', { class: 'scroll' });
  body.append(el('div', { class: 'row' }, el('div', { class: 'grow' }, search), listSel,
    el('label', { class: 'row', style: 'margin:0;text-transform:none' }, withValues, ' Only cards with values'),
    el('button', { onclick: () => exportCsv(filtered()) }, 'Export CSV')), el('div', { class: 'row', style: 'margin:6px 0' }, summary), wrap);

  function filtered() {
    const q = tableState.q.trim().toLowerCase();
    let out = rows.filter((r) => (!tableState.list || r.card.idList === tableState.list)
      && (!tableState.withValues || fields.some((f) => formatValue(f, r.values[f.id]) !== ''))
      && (!q || r.card.name.toLowerCase().includes(q) || fields.some((f) => formatValue(f, r.values[f.id]).toLowerCase().includes(q))));
    if (tableState.sort) {
      const key = tableState.sort;
      const f = fields.find((x) => x.id === key);
      const val = (r) => {
        if (key === '__name') return r.card.name.toLowerCase();
        if (key === '__list') return r.list.toLowerCase();
        const v = r.values[key];
        if (v === undefined || v === null) return null;
        return f && (f.type === 'number' || f.type === 'date') ? v : formatValue(f, v).toLowerCase();
      };
      out = [...out].sort((a, b) => {
        const x = val(a); const y = val(b);
        if (x === null && y === null) return 0;
        if (x === null) return 1; // empty values last
        if (y === null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * tableState.dir;
      });
    }
    return out;
  }

  function header(key, label) {
    const arrow = tableState.sort === key ? (tableState.dir === 1 ? ' ▲' : ' ▼') : '';
    return el('th', { class: 'sortable', tabindex: '0', 'aria-sort': tableState.sort === key ? (tableState.dir === 1 ? 'ascending' : 'descending') : 'none',
      onclick: () => { if (tableState.sort === key) tableState.dir *= -1; else { tableState.sort = key; tableState.dir = 1; } draw(); },
      onkeydown: (e) => { if (e.key === 'Enter') e.target.click(); } }, label + arrow);
  }

  function cell(f, v) {
    if (v === undefined || v === null || v === '') return el('td', { class: 'muted' }, '—');
    if (f.type === 'choice') {
      const o = (f.options || []).find((x) => x.id === v);
      return el('td', {}, o ? el('span', { class: `pill ${o.color}` }, o.label) : '');
    }
    if (f.type === 'notes') return el('td', { title: String(v) }, formatValue(f, v, { short: true }));
    return el('td', {}, formatValue(f, v));
  }

  function draw() {
    clear(wrap);
    const list = filtered();
    summary.textContent = `${list.length} cards`;
    const table = el('table', {}, el('thead', {}, el('tr', {}, header('__name', 'Card'), header('__list', 'List'), fields.map((f) => header(f.id, f.name)))));
    const tbody = el('tbody');
    for (const r of list) {
      tbody.append(el('tr', { class: 'clickable', onclick: () => t.showCard(r.card.id) },
        el('td', {}, el('strong', {}, truncate(r.card.name, 40))), el('td', {}, r.list), fields.map((f) => cell(f, r.values[f.id]))));
    }
    table.append(tbody);
    wrap.append(list.length ? table : el('p', { class: 'muted' }, 'No cards match.'));
  }

  function exportCsv(list) {
    const lines = [['Card', 'List', 'Card link', ...fields.map((f) => f.name)].map(csvCell).join(',')];
    for (const r of list) lines.push([r.card.name, r.list, r.card.url || '', ...fields.map((f) => formatValue(f, r.values[f.id]))].map(csvCell).join(','));
    const a = el('a', { href: URL.createObjectURL(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv' })), download: `fields-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove();
  }

  draw();
}

// --- Manage fields ----------------------------------------------------------
let draft = null; // editable copy of board.fields

function drawManage() {
  if (!draft) draft = JSON.parse(JSON.stringify(board.fields || []));
  const listEl = el('div');
  const saveBtn = el('button', { class: 'primary', onclick: save }, 'Save fields');
  body.append(el('p', { class: 'muted' }, el('small', {}, 'Fields appear on every card of this board in the Keel section → Fields tab. "Show on cards" decides which fields a card shows until someone picks its own with "Visible fields".')),
    listEl,
    el('div', { class: 'row', style: 'margin-top:8px' },
      el('button', { onclick: () => { draft.push({ id: newId(), name: '', type: 'text', shown: true, badge: false }); draw(); listEl.lastChild && listEl.lastChild.querySelector('input').focus(); } }, '+ Add field'),
      el('span', { class: 'grow' }), saveBtn));

  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= draft.length) return;
    [draft[i], draft[j]] = [draft[j], draft[i]];
    draw();
  }

  function draw() {
    clear(listEl);
    if (!draft.length) listEl.append(el('p', { class: 'muted' }, 'No fields yet. Add one below.'));
    draft.forEach((f, i) => {
      const box = el('div', { class: 'track' });
      const name = el('input', { type: 'text', placeholder: 'Field name, e.g. VAT Status', maxlength: '60', value: f.name, 'aria-label': 'Field name', oninput: () => { f.name = name.value; } });
      const type = el('select', { 'aria-label': 'Field type', onchange: () => {
        f.type = type.value;
        if (f.type === 'choice' && !(f.options && f.options.length)) f.options = [{ id: newId(), label: '', color: 'green' }];
        if (f.type === 'notes') f.badge = false;
        draw();
      } }, Object.entries(TYPES).map(([k, v]) => el('option', { value: k, selected: k === f.type }, v.label)));
      let confirmDelete = false;
      const del = el('button', { class: 'small', title: 'Delete field', onclick: () => {
        if (!confirmDelete) { confirmDelete = true; del.textContent = 'Click again to delete'; del.classList.add('danger'); return; }
        draft.splice(i, 1); draw();
      } }, 'Delete');
      box.append(el('div', { class: 'row' }, el('div', { class: 'grow' }, name), el('div', {}, type),
        el('button', { class: 'icon', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
        el('button', { class: 'icon', title: 'Move down', 'aria-label': 'Move down', disabled: i === draft.length - 1, onclick: () => move(i, 1) }, '↓'),
        del));
      box.append(el('small', { class: 'muted' }, TYPES[f.type].hint));
      const shown = el('input', { type: 'checkbox', checked: f.shown !== false, onchange: () => { f.shown = shown.checked; } });
      const badge = el('input', { type: 'checkbox', checked: !!f.badge, disabled: f.type === 'notes', onchange: () => { f.badge = badge.checked; } });
      box.append(el('div', { class: 'row' },
        el('label', { class: 'row', style: 'text-transform:none;font-weight:400;margin:4px 0' }, shown, ' Show on cards'),
        el('label', { class: 'row', style: 'text-transform:none;font-weight:400;margin:4px 0', title: f.type === 'notes' ? 'Notes are too long for a badge' : '' }, badge, ' Badge on card front')));
      if (f.type === 'choice') {
        const opts = el('div', { class: 'options' });
        (f.options || []).forEach((o, k) => {
          const label = el('input', { type: 'text', placeholder: `Option ${k + 1}, e.g. VAT`, maxlength: '40', value: o.label, 'aria-label': 'Option label', oninput: () => { o.label = label.value; } });
          const color = el('select', { 'aria-label': 'Badge colour', onchange: () => { o.color = color.value; sw.className = `pill swatch ${o.color}`; } },
            COLORS.map((c) => el('option', { value: c, selected: c === o.color }, c)));
          const sw = el('span', { class: `pill swatch ${o.color}`, 'aria-hidden': 'true' });
          opts.append(el('div', { class: 'row', style: 'margin:3px 0' }, el('div', { class: 'grow' }, label), sw, el('div', {}, color),
            el('button', { class: 'icon', title: 'Remove option', 'aria-label': 'Remove option', disabled: f.options.length < 2, onclick: () => { f.options.splice(k, 1); draw(); } }, '×')));
        });
        opts.append(el('button', { class: 'small', onclick: () => { f.options.push({ id: newId(), label: '', color: COLORS[f.options.length % COLORS.length] }); draw(); } }, '+ Add option'));
        box.append(opts);
      }
      listEl.append(box);
    });
  }

  async function save() {
    const clean = draft.map((f) => ({ ...f, name: (f.name || '').trim(), options: f.type === 'choice' ? (f.options || []).map((o) => ({ ...o, label: (o.label || '').trim() })) : undefined }));
    const missing = clean.find((f) => !f.name);
    if (missing) return setStatus('Every field needs a name', 'error');
    const emptyOpt = clean.find((f) => f.type === 'choice' && f.options.some((o) => !o.label));
    if (emptyOpt) return setStatus(`Every option of "${emptyOpt.name}" needs a label`, 'error');
    saveBtn.disabled = true;
    setStatus('Saving…');
    try {
      const res = await api.saveFields(t, boardId, clean, board.updatedAt || 0);
      board.fields = res.fields;
      board.updatedAt = res.updatedAt;
      draft = JSON.parse(JSON.stringify(res.fields));
      await markBoardChanged(t);
      setStatus('Fields saved', 'success');
      draw();
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  }

  draw();
}

// --- Import (scan other Power-Ups' data) ------------------------------------
// Keel's own pluginData keys, used to tell Keel's data apart from other Power-Ups'.
const KEEL_KEYS = ['priority', 'company', 'views', 'parent', 'children', 'crm', 'schedule', 'features', 'routines', 'audit', 'settings', 'scheduleLog', 'fieldsRev'];

function parse(value) {
  try { return JSON.parse(value); } catch { return value; }
}

function isKeel(entry) {
  const v = parse(entry.value);
  return v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0 && Object.keys(v).every((k) => KEEL_KEYS.includes(k));
}

function drawImport() {
  const out = el('div');
  const scanBtn = el('button', { class: 'primary', onclick: scan }, 'Scan this board');
  body.append(el('p', {}, 'Look for data that other Power-Ups (such as Amazing Fields) keep on this board and its cards, so it can be copied into Keel\'s fields.'),
    el('p', { class: 'muted' }, el('small', {}, 'Scanning only reads. Nothing is changed in Trello or in the other Power-Up.')),
    scanBtn, out);

  async function scan() {
    scanBtn.disabled = true;
    clear(out);
    setStatus('Scanning…');
    try {
      const [boardData, cards] = await Promise.all([
        trello(t, 'GET', `/boards/${boardId}/pluginData`),
        trello(t, 'GET', `/boards/${boardId}/cards`, { fields: 'name', pluginData: 'true', filter: 'open' })
      ]);
      const plugins = new Map();
      const note = (entry, where) => {
        if (isKeel(entry)) return;
        const p = plugins.get(entry.idPlugin) || { id: entry.idPlugin, board: 0, cards: 0, chars: 0, keys: new Set() };
        p[where] += 1;
        p.chars += String(entry.value || '').length;
        const v = parse(entry.value);
        if (v && typeof v === 'object') Object.keys(v).slice(0, 8).forEach((k) => p.keys.add(k));
        plugins.set(entry.idPlugin, p);
      };
      (boardData || []).forEach((e) => note(e, 'board'));
      for (const c of cards || []) (c.pluginData || []).forEach((e) => note(e, 'cards'));
      setStatus('');
      if (!plugins.size) {
        out.append(el('p', { class: 'notice' }, 'No data from other Power-Ups was found. Trello may not share Amazing Fields\' data with other Power-Ups; the next option is Trello\'s board export (board menu → Print, export and share → Export as JSON).'));
        return;
      }
      out.append(el('h3', { style: 'margin-top:10px' }, 'Found'), el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Power-Up id'), el('th', {}, 'Board data'), el('th', {}, 'Cards with data'), el('th', {}, 'Size'), el('th', {}, 'Keys'))),
        el('tbody', {}, [...plugins.values()].map((p) => el('tr', {}, el('td', {}, el('code', {}, p.id)), el('td', {}, p.board ? 'yes' : '—'), el('td', {}, String(p.cards)),
          el('td', {}, `${Math.round(p.chars / 100) / 10} KB`), el('td', {}, el('small', {}, [...p.keys].slice(0, 8).join(', '))))))));
      const saveBtn = el('button', { class: 'primary', onclick: async () => {
        saveBtn.disabled = true;
        try {
          const keep = (list) => (list || []).filter((e) => !isKeel(e)).map((e) => ({ idPlugin: e.idPlugin, scope: e.scope, access: e.access, value: e.value }));
          const sample = { scannedAt: new Date().toISOString(), board: keep(boardData), cards: [] };
          let size = JSON.stringify(sample).length;
          for (const c of cards || []) {
            const entry = { id: c.id, name: c.name, pluginData: keep(c.pluginData) };
            if (!entry.pluginData.length) continue;
            const s = JSON.stringify(entry).length;
            if (size + s > 800000) break;
            sample.cards.push(entry);
            size += s;
          }
          await api.sample(t, boardId, sample);
          setStatus(`Saved a copy of ${sample.cards.length} cards' data for setting up the import`, 'success');
        } catch (err) {
          setStatus(err.message, 'error');
          saveBtn.disabled = false;
        }
      } }, 'Save a copy for import setup');
      out.append(el('p', {}, 'The import can be set up from a copy of this data. The copy is stored in Keel\'s own database (your Cloudflare account) and is only used for that.'), saveBtn);
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      scanBtn.disabled = false;
    }
  }
}

t.render(render);
