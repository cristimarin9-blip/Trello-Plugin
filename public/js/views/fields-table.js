// "Table view": every card with its field values. Search, Filter, Sort, Columns,
// Group by, Show N, saved views, inline editing and export to a spreadsheet (CSV).
import { api, isLayout, isEmpty, formatValue, optionOf, csvCell, markCardChanged, newId } from '../lib/fields.js';
import { editorFor, valueView, typeIcon } from '../lib/field-ui.js';
import { clear, el, setStatus, truncate } from '../lib/util.js';

const BUILTIN = { __name: 'Name', __list: 'List', __members: 'Members' };
const LIMITS = [50, 100, 250, 500, 1000];
const INLINE = ['choice', 'checkbox', 'rating', 'multi']; // edited directly in the cell

const OPS = {
  text: [['contains', 'contains'], ['is', 'is'], ['empty', 'is empty'], ['notempty', 'is not empty']],
  choice: [['is', 'is'], ['not', 'is not'], ['empty', 'is empty'], ['notempty', 'is not empty']],
  multi: [['contains', 'includes'], ['empty', 'is empty'], ['notempty', 'is not empty']],
  checkbox: [['is', 'is']],
  number: [['gt', '>'], ['lt', '<'], ['is', '='], ['empty', 'is empty'], ['notempty', 'is not empty']],
  date: [['before', 'before'], ['after', 'after'], ['is', 'on'], ['empty', 'is empty'], ['notempty', 'is not empty']],
  list: [['is', 'is'], ['not', 'is not']]
};
const opsFor = (f) => (!f ? OPS.list : f.type === 'choice' ? OPS.choice : f.type === 'multi' ? OPS.multi : f.type === 'checkbox' ? OPS.checkbox
  : ['number', 'rating', 'progress'].includes(f.type) ? OPS.number : f.type === 'date' ? OPS.date : OPS.text);

// Current table settings; kept while the modal is open.
const st = { viewId: null, search: '', filters: [], sort: null, columns: null, groupBy: '', limit: 250, panel: null, collapsed: new Set() };
const settingsOf = () => ({ search: st.search, filters: st.filters, sort: st.sort, columns: st.columns, groupBy: st.groupBy || null, limit: st.limit });

export async function drawTable(root, ctx) {
  const { t } = ctx;
  const fields = (ctx.board.fields || []).filter((f) => !isLayout(f));
  const byId = new Map(fields.map((f) => [f.id, f]));
  const lists = ctx.trello.lists;
  const listIndex = new Map(lists.map((l, i) => [l.id, i]));
  const listName = new Map(lists.map((l) => [l.id, l.name]));
  const views = ctx.board.views || [];

  if (!fields.length) {
    root.append(el('div', { class: 'empty-state' }, el('p', {}, 'No fields yet. Add fields such as VAT status or company number to see every card\'s values here.'),
      el('button', { class: 'primary', onclick: () => ctx.go('manage') }, '+ Add fields')));
    return;
  }
  if (st.viewId && !views.some((v) => v.id === st.viewId)) st.viewId = null;
  if (!st.viewId && views.length && !st.touched) load(views[0]);

  const rows = ctx.trello.cards.map((c) => ({ card: c, list: listName.get(c.idList) || '', values: (ctx.board.cards[c.id] && ctx.board.cards[c.id].values) || {} }));

  function load(v) {
    Object.assign(st, { viewId: v.id, search: v.search || '', filters: JSON.parse(JSON.stringify(v.filters || [])), sort: v.sort, columns: v.columns, groupBy: v.groupBy || '', limit: v.limit || 250 });
  }
  const current = () => views.find((v) => v.id === st.viewId) || null;
  const changed = () => { const v = current(); return !v || JSON.stringify(settingsOf()) !== JSON.stringify({ search: v.search, filters: v.filters, sort: v.sort, columns: v.columns, groupBy: v.groupBy, limit: v.limit }); };

  // --- Layout ---------------------------------------------------------------
  const viewTabs = el('div', { class: 'view-tabs' });
  const toolbar = el('div', { class: 'ttoolbar' });
  const panel = el('div', { class: 'tpanel' });
  const tableWrap = el('div', { class: 'tscroll' });
  root.append(viewTabs, toolbar, panel, tableWrap);

  async function persistViews(next, message) {
    try {
      const res = await api.saveViews(t, ctx.boardId, next);
      ctx.board.views = res.views;
      ctx.selfWriteAt = Date.now();
      setStatus(message, 'success');
      return true;
    } catch (err) { setStatus(err.message, 'error'); return false; }
  }

  function drawViewTabs() {
    clear(viewTabs);
    const list = ctx.board.views || [];
    if (!list.length) viewTabs.append(el('button', { class: 'active' }, 'Main Table'));
    for (const v of list) {
      viewTabs.append(el('button', { class: v.id === st.viewId ? 'active' : '', onclick: () => { st.touched = true; load(v); redraw(); } }, v.name, v.id === st.viewId && changed() ? ' ●' : ''));
    }
    const nameInput = el('input', { type: 'text', maxlength: '40', placeholder: 'View name', class: 'view-name', hidden: true });
    const addBtn = el('button', { class: 'icon', title: 'Save these settings as a new view', 'aria-label': 'New view', onclick: () => { nameInput.hidden = false; nameInput.focus(); } }, '+');
    nameInput.onkeydown = async (e) => {
      if (e.key === 'Escape') { nameInput.hidden = true; return; }
      if (e.key !== 'Enter' || !nameInput.value.trim()) return;
      const v = { id: newId(), name: nameInput.value.trim(), ...settingsOf() };
      if (await persistViews([...(ctx.board.views || []), v], `Saved view "${v.name}"`)) { st.viewId = v.id; redraw(); }
    };
    viewTabs.append(addBtn, nameInput);
  }

  // --- Toolbar ----------------------------------------------------------------
  function drawToolbar() {
    clear(toolbar);
    const search = el('input', { type: 'search', placeholder: 'Search…', value: st.search, 'aria-label': 'Search cards and values', oninput: () => { st.search = search.value; st.touched = true; drawRows(); drawViewTabs(); } });
    const tb = (id, label, count) => el('button', { class: `tb${st.panel === id ? ' active' : ''}${count ? ' set' : ''}`, 'aria-expanded': String(st.panel === id), onclick: () => { st.panel = st.panel === id ? null : id; drawToolbar(); drawPanel(); } }, label, count ? el('span', { class: 'count' }, String(count)) : null);
    const limit = el('select', { class: 'tb-select', 'aria-label': 'Rows to show', onchange: () => { st.limit = Number(limit.value); st.touched = true; drawRows(); drawViewTabs(); } },
      LIMITS.map((n) => el('option', { value: String(n), selected: n === st.limit }, `Show: ${n}`)));
    const v = current();
    toolbar.append(...[el('div', { class: 'search-box' }, search),
      tb('filter', '⏷ Filter', st.filters.length), tb('sort', '⇅ Sort', st.sort ? 1 : 0), tb('columns', '▥ Columns', st.columns ? 1 : 0), tb('group', '☰ Group by', st.groupBy ? 1 : 0), limit,
      v && changed() ? el('button', { class: 'tb', onclick: async () => {
        const next = (ctx.board.views || []).map((x) => (x.id === v.id ? { ...x, ...settingsOf() } : x));
        if (await persistViews(next, `Updated view "${v.name}"`)) redraw();
      } }, '💾 Save view') : null,
      v ? el('button', { class: 'tb', title: 'Delete this saved view', onclick: async (e) => {
        if (e.currentTarget.dataset.confirm !== '1') { e.currentTarget.dataset.confirm = '1'; e.currentTarget.textContent = 'Click again to delete view'; return; }
        if (await persistViews((ctx.board.views || []).filter((x) => x.id !== v.id), `Deleted view "${v.name}"`)) { st.viewId = null; st.touched = true; redraw(); }
      } }, '🗑') : null,
      el('span', { class: 'grow' }),
      el('button', { class: 'tb', onclick: exportCsv }, '⇩ Export to spreadsheet')].filter(Boolean));
  }

  // --- Panels -------------------------------------------------------------------
  const fieldSelect = (value, onchange, { includeList = false } = {}) => el('select', { onchange: (e) => onchange(e.target.value) },
    includeList ? el('option', { value: '__list', selected: value === '__list' }, 'List') : null,
    fields.map((f) => el('option', { value: f.id, selected: f.id === value }, f.name)));

  function valueInput(filter) {
    const f = byId.get(filter.field);
    const set = (v) => { filter.value = v; st.touched = true; drawRows(); drawViewTabs(); drawToolbar(); };
    if (['empty', 'notempty'].includes(filter.op)) return el('span');
    if (!f) return el('select', { onchange: (e) => set(e.target.value) }, lists.map((l) => el('option', { value: l.id, selected: l.id === filter.value }, l.name)));
    if (f.type === 'choice' || f.type === 'multi') return el('select', { onchange: (e) => set(e.target.value) }, el('option', { value: '' }, '—'), f.options.map((o) => el('option', { value: o.id, selected: o.id === filter.value }, o.label)));
    if (f.type === 'checkbox') return el('select', { onchange: (e) => set(e.target.value === 'true') }, el('option', { value: 'true', selected: filter.value === true }, 'ticked'), el('option', { value: 'false', selected: filter.value === false }, 'not ticked'));
    const type = f.type === 'date' ? 'date' : ['number', 'rating', 'progress'].includes(f.type) ? 'number' : 'text';
    const inp = el('input', { type, value: filter.value ?? '', placeholder: 'value', oninput: () => set(type === 'number' && inp.value !== '' ? Number(inp.value) : inp.value) });
    return inp;
  }

  function drawPanel() {
    clear(panel);
    panel.hidden = !st.panel;
    if (st.panel === 'filter') {
      st.filters.forEach((flt, i) => {
        const ops = opsFor(byId.get(flt.field));
        panel.append(el('div', { class: 'row nowrap prow' }, el('small', { class: 'muted' }, i ? 'and' : 'Where'),
          fieldSelect(flt.field, (v) => { flt.field = v; flt.op = opsFor(byId.get(v))[0][0]; flt.value = ''; st.touched = true; drawPanel(); drawRows(); drawToolbar(); drawViewTabs(); }, { includeList: true }),
          el('select', { onchange: (e) => { flt.op = e.target.value; st.touched = true; drawPanel(); drawRows(); drawViewTabs(); } }, ops.map(([k, l]) => el('option', { value: k, selected: k === flt.op }, l))),
          valueInput(flt),
          el('button', { class: 'icon', 'aria-label': 'Remove filter', onclick: () => { st.filters.splice(i, 1); st.touched = true; drawPanel(); drawRows(); drawToolbar(); drawViewTabs(); } }, '×')));
      });
      panel.append(el('button', { class: 'small', onclick: () => { const f = fields[0]; st.filters.push({ field: f.id, op: opsFor(f)[0][0], value: '' }); st.touched = true; drawPanel(); drawToolbar(); } }, '+ Add filter'));
    } else if (st.panel === 'sort') {
      const sel = el('select', { onchange: () => { st.sort = sel.value ? { field: sel.value, dir: st.sort ? st.sort.dir : 1 } : null; st.touched = true; drawPanel(); drawRows(); drawToolbar(); drawViewTabs(); } },
        el('option', { value: '' }, 'Board order'), Object.entries(BUILTIN).filter(([k]) => k !== '__members').map(([k, l]) => el('option', { value: k, selected: st.sort && st.sort.field === k }, l)),
        fields.map((f) => el('option', { value: f.id, selected: st.sort && st.sort.field === f.id }, f.name)));
      const dir = el('select', { disabled: !st.sort, onchange: () => { st.sort.dir = Number(dir.value); st.touched = true; drawRows(); drawViewTabs(); drawToolbar(); } },
        el('option', { value: '1', selected: !st.sort || st.sort.dir === 1 }, 'Ascending (A→Z, 1→9, oldest first)'), el('option', { value: '-1', selected: st.sort && st.sort.dir === -1 }, 'Descending'));
      panel.append(el('div', { class: 'row nowrap prow' }, el('small', { class: 'muted' }, 'Sort by'), sel, dir), el('small', { class: 'muted' }, 'Tip: click a column heading to sort by it. Empty values always go last.'));
    } else if (st.panel === 'columns') {
      const all = [...Object.keys(BUILTIN).filter((k) => k !== '__name'), ...fields.map((f) => f.id)];
      const shown = new Set(st.columns || all);
      const grid = el('div', { class: 'col-grid' });
      for (const id of all) {
        const f = byId.get(id);
        const box = el('input', { type: 'checkbox', checked: shown.has(id), onchange: () => {
          if (box.checked) shown.add(id); else shown.delete(id);
          st.columns = all.filter((x) => shown.has(x));
          if (st.columns.length === all.length) st.columns = null;
          st.touched = true; drawRows(); drawToolbar(); drawViewTabs();
        } });
        grid.append(el('label', { class: 'check-row' }, box, f ? typeIcon(f.type) : null, el('span', {}, f ? f.name : BUILTIN[id])));
      }
      panel.append(el('div', { class: 'row between' }, el('strong', {}, 'Columns'), el('span', { class: 'row' },
        el('button', { class: 'small', onclick: () => { st.columns = null; st.touched = true; drawPanel(); drawRows(); drawToolbar(); drawViewTabs(); } }, 'All'),
        el('button', { class: 'small', onclick: () => { st.columns = []; st.touched = true; drawPanel(); drawRows(); drawToolbar(); drawViewTabs(); } }, 'None'))), grid);
    } else if (st.panel === 'group') {
      const groupable = fields.filter((f) => f.type === 'choice' || f.type === 'checkbox');
      const sel = el('select', { onchange: () => { st.groupBy = sel.value; st.collapsed.clear(); st.touched = true; drawRows(); drawToolbar(); drawViewTabs(); } },
        el('option', { value: '' }, 'No grouping'), el('option', { value: '__list', selected: st.groupBy === '__list' }, 'List'),
        groupable.map((f) => el('option', { value: f.id, selected: st.groupBy === f.id }, f.name)));
      panel.append(el('div', { class: 'row nowrap prow' }, el('small', { class: 'muted' }, 'Group by'), sel), el('small', { class: 'muted' }, 'Lists, choice fields and checkboxes can be grouped.'));
    }
  }

  // --- Rows ---------------------------------------------------------------------
  function matches(row, flt) {
    if (flt.field === '__list') return flt.op === 'not' ? row.card.idList !== flt.value : row.card.idList === flt.value;
    const f = byId.get(flt.field);
    if (!f) return true;
    const v = row.values[f.id];
    const empty = isEmpty(v);
    const val = flt.value;
    switch (flt.op) {
      case 'empty': return empty;
      case 'notempty': return !empty;
      case 'is':
        if (f.type === 'checkbox') return !!v === (val !== false && val !== 'false');
        if (val === '' || val === undefined) return true;
        if (['number', 'rating', 'progress'].includes(f.type)) return !empty && Number(v) === Number(val);
        if (f.type === 'choice' || f.type === 'date') return v === val;
        return formatValue(f, v).toLowerCase() === String(val).toLowerCase();
      case 'not': return val === '' ? true : v !== val;
      case 'contains':
        if (val === '' || val === undefined) return true;
        if (f.type === 'multi') return Array.isArray(v) && v.includes(val);
        return formatValue(f, v).toLowerCase().includes(String(val).toLowerCase());
      case 'gt': return val === '' || (!empty && Number(v) > Number(val));
      case 'lt': return val === '' || (!empty && Number(v) < Number(val));
      case 'before': return !val || (!empty && v < val);
      case 'after': return !val || (!empty && v > val);
      default: return true;
    }
  }

  function filtered() {
    const q = st.search.trim().toLowerCase();
    let out = rows.filter((r) => st.filters.every((f) => matches(r, f))
      && (!q || r.card.name.toLowerCase().includes(q) || r.list.toLowerCase().includes(q) || fields.some((f) => formatValue(f, r.values[f.id]).toLowerCase().includes(q))));
    if (st.sort) {
      const { field: key, dir } = st.sort;
      const f = byId.get(key);
      const val = (r) => {
        if (key === '__name') return r.card.name.toLowerCase();
        if (key === '__list') return listIndex.get(r.card.idList) ?? 999;
        const v = r.values[key];
        if (!f || isEmpty(v)) return null;
        if (['number', 'rating', 'progress', 'date'].includes(f.type)) return v;
        if (f.type === 'choice') return f.options.findIndex((o) => o.id === v);
        return formatValue(f, v).toLowerCase();
      };
      out = [...out].sort((a, b) => {
        const x = val(a); const y = val(b);
        if (x === null && y === null) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * dir;
      });
    }
    return out;
  }

  function groups(list) {
    if (!st.groupBy) return [{ key: 'all', label: 'All Cards', rows: list }];
    if (st.groupBy === '__list') return lists.map((l) => ({ key: l.id, label: l.name, rows: list.filter((r) => r.card.idList === l.id) })).filter((g) => g.rows.length);
    const f = byId.get(st.groupBy);
    if (!f) return [{ key: 'all', label: 'All Cards', rows: list }];
    if (f.type === 'checkbox') return [{ key: 'yes', label: `${f.name}: ticked`, rows: list.filter((r) => r.values[f.id]) }, { key: 'no', label: `${f.name}: not ticked`, rows: list.filter((r) => !r.values[f.id]) }].filter((g) => g.rows.length);
    return [...f.options.map((o) => ({ key: o.id, label: o.label, color: o.color, rows: list.filter((r) => r.values[f.id] === o.id) })),
      { key: '__none', label: `No ${f.name}`, rows: list.filter((r) => !optionOf(f, r.values[f.id])) }].filter((g) => g.rows.length);
  }

  const columns = () => {
    const all = [...Object.keys(BUILTIN).filter((k) => k !== '__name'), ...fields.map((f) => f.id)];
    return ['__name', ...(st.columns ? all.filter((id) => st.columns.includes(id)) : all)];
  };

  async function commitCell(row, f, value) {
    try {
      const res = await api.patchCard(t, row.card.id, { values: { [f.id]: value } });
      row.values = res.values || {};
      ctx.board.cards[row.card.id] = { values: row.values, visible: res.visible };
      ctx.selfWriteAt = Date.now();
      if (f.badge || f.required) markCardChanged(t, row.card.id);
      setStatus(`Saved ${f.name} on ${truncate(row.card.name, 30)}`, 'success');
      return true;
    } catch (err) { setStatus(err.message, 'error'); return false; }
  }

  function cell(row, id) {
    if (id === '__name') {
      return el('td', { class: 'name-cell' }, el('button', { class: 'open-card', title: 'Open card', 'aria-label': `Open ${row.card.name}`, onclick: () => t.showCard(row.card.id) }, '↗'), el('span', { title: row.card.name }, truncate(row.card.name, 48)));
    }
    if (id === '__list') return el('td', {}, row.list);
    if (id === '__members') return el('td', {}, (row.card.members || []).map((m) => el('span', { class: 'avatar', title: m.fullName || m.username }, (m.fullName || m.username || '?').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase())));
    const f = byId.get(id);
    const td = el('td', { class: `fcol t-${f.type}${f.required && isEmpty(row.values[f.id]) && f.type !== 'checkbox' ? ' missing' : ''}` });
    if (INLINE.includes(f.type) && !(f.type === 'choice' && f.display === 'dropdown')) {
      td.append(editorFor(f, row.values[f.id], (v) => commitCell(row, f, v), { compact: true }));
      return td;
    }
    const showView = () => { clear(td); td.append(valueView(f, row.values[f.id])); };
    td.tabIndex = 0;
    td.title = 'Click to edit';
    const edit = () => {
      if (td.classList.contains('editing')) return;
      td.classList.add('editing');
      clear(td);
      const ed = editorFor(f, row.values[f.id], (v) => commitCell(row, f, v), { compact: true });
      td.append(ed);
      const focusable = td.querySelector('input:not([type=checkbox]), select, textarea, .notes-view');
      if (focusable && focusable.classList.contains('notes-view')) focusable.click();
      const target = td.querySelector('input, select, textarea');
      if (target) target.focus();
    };
    td.onclick = edit;
    td.onkeydown = (e) => { if (e.key === 'Enter' && !td.classList.contains('editing')) edit(); if (e.key === 'Escape') { td.classList.remove('editing'); showView(); td.focus(); } };
    td.addEventListener('focusout', () => setTimeout(() => {
      if (!td.contains(document.activeElement) && td.classList.contains('editing') && !td.querySelector('textarea')) { td.classList.remove('editing'); td.className = `fcol t-${f.type}${f.required && isEmpty(row.values[f.id]) ? ' missing' : ''}`; showView(); }
    }, 150));
    showView();
    return td;
  }

  function drawRows() {
    clear(tableWrap);
    const list = filtered();
    const cols = columns();
    const head = el('tr', {}, cols.map((id) => {
      const f = byId.get(id);
      const sortable = id !== '__members';
      const on = st.sort && st.sort.field === id;
      return el('th', { class: sortable ? 'sortable' : '', tabindex: sortable ? '0' : null, 'aria-sort': on ? (st.sort.dir === 1 ? 'ascending' : 'descending') : null,
        onclick: sortable ? () => { st.sort = on ? (st.sort.dir === 1 ? { field: id, dir: -1 } : null) : { field: id, dir: 1 }; st.touched = true; drawRows(); drawToolbar(); drawViewTabs(); if (st.panel === 'sort') drawPanel(); } : null,
        onkeydown: (e) => { if (e.key === 'Enter') e.currentTarget.click(); } },
      f ? typeIcon(f.type) : null, f ? f.name : BUILTIN[id], on ? (st.sort.dir === 1 ? ' ▲' : ' ▼') : '');
    }));
    const table = el('table', { class: 'ftable' }, el('thead', {}, head));
    let shown = 0;
    for (const g of groups(list)) {
      const collapsed = st.collapsed.has(g.key);
      const tbody = el('tbody');
      tbody.append(el('tr', { class: 'group-row' }, el('td', { colspan: String(cols.length) },
        el('button', { class: 'group-toggle', 'aria-expanded': String(!collapsed), onclick: () => { if (collapsed) st.collapsed.delete(g.key); else st.collapsed.add(g.key); drawRows(); } },
          collapsed ? '▸ ' : '▾ ', g.color ? el('span', { class: `pill ${g.color}` }, g.label) : el('strong', {}, g.label), el('span', { class: 'count' }, String(g.rows.length))))));
      if (!collapsed) {
        for (const r of g.rows) {
          if (shown >= st.limit) break;
          shown += 1;
          tbody.append(el('tr', {}, cols.map((id) => cell(r, id))));
        }
      }
      table.append(tbody);
    }
    tableWrap.append(list.length ? table : el('p', { class: 'muted', style: 'padding:12px' }, 'No cards match.'));
    if (list.length > st.limit) tableWrap.append(el('p', { class: 'muted' }, el('small', {}, `Showing ${st.limit} of ${list.length} cards. Change "Show" to see more.`)));
  }

  function exportCsv() {
    const cols = columns();
    const head = cols.map((id) => (byId.get(id) ? byId.get(id).name : BUILTIN[id]));
    const lines = [[...head, 'Card link'].map(csvCell).join(',')];
    for (const r of filtered()) {
      lines.push([...cols.map((id) => {
        if (id === '__name') return r.card.name;
        if (id === '__list') return r.list;
        if (id === '__members') return (r.card.members || []).map((m) => m.fullName || m.username).join(', ');
        return formatValue(byId.get(id), r.values[id]);
      }), r.card.url || ''].map(csvCell).join(','));
    }
    const name = (current() ? current().name : 'fields').replace(/[^\w-]+/g, '-').toLowerCase();
    const a = el('a', { href: URL.createObjectURL(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv' })), download: `${name}-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove();
  }

  function redraw() {
    drawViewTabs();
    drawToolbar();
    drawPanel();
    drawRows();
  }
  redraw();
}
