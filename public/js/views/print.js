// Print / handover editor: choose what of a card is printed, in what order, and how it
// looks, with a live page preview. "Print" prints just the page (or saves it as a PDF).
import { initIframe } from '../lib/iframe.js';
import { KEYS } from '../config.js';
import { get, set, remove } from '../lib/storage.js';
import { api as trello, cards as trelloCards, getToken } from '../lib/trello-api.js';
import { api as fieldsApi, isLayout, isComputed, isEmpty, visibleFields, formatValue, renderNotes, loadContext, valuesWithComputed, optionOf } from '../lib/fields.js';
import { groupFields } from '../lib/field-ui.js';
import { TRACKS, summarize } from '../features/crm.js';
import { PRIORITIES } from '../features/priority.js';
import { SECTIONS, PAGE, HANDOVER_MAX, defaultLayout, sanitizeLayout, compactLayout } from '../lib/print-layout.js';
import { byId, clear, el, formatDate, formatDateTime, setStatus } from '../lib/util.js';

const t = initIframe();
const app = byId('app');
const LAYOUT_KEY = 'printLayout';
const HANDOVER_KEY = 'handover';

let layout = defaultLayout();
let data = null;
let handover = '';

// --- Data -------------------------------------------------------------------------------

async function settle(promise, fallback) {
  try { return await promise; } catch (err) { console.warn('Keel print:', err.message); return fallback; }
}

async function loadData() {
  const card = await t.card('id', 'name', 'desc', 'due', 'dueComplete', 'start', 'labels', 'members', 'idList', 'url', 'attachments', 'shortLink');
  const authed = !!(await settle(getToken(t), null));
  const [board, lists, me, company, crm, parent, children, priority, savedLayout, note, allCards] = await Promise.all([
    settle(t.board('id', 'name'), {}), settle(t.lists('id', 'name'), []), settle(t.member('fullName', 'username'), {}),
    get(t, 'card', KEYS.company), get(t, 'card', KEYS.crm), get(t, 'card', KEYS.parent), get(t, 'card', KEYS.children),
    get(t, 'card', KEYS.priority), get(t, 'board', LAYOUT_KEY), get(t, 'card', HANDOVER_KEY), settle(t.cards('id', 'name', 'dueComplete', 'idShort', 'dateLastActivity', 'due', 'badges'), [])
  ]);
  const [lists2, comments, fields] = await Promise.all([
    authed ? settle(trelloCards.checklists(t, card.id), null) : null,
    authed ? settle(trello(t, 'GET', `/cards/${card.id}/actions`, { filter: 'commentCard', limit: 50 }), null) : null,
    authed ? settle(fieldsApi.card(t, card.id), null) : null
  ]);
  let fieldCtx = null;
  if (fields && fields.fields && fields.fields.length) fieldCtx = await settle(loadContext(t, fields.fields, { boardId: board.id, cards: allCards }), null);
  return {
    card, board, list: (lists.find((l) => l.id === card.idList) || {}).name || '', me, authed,
    company, crm, parent, children: children || [], priority, savedLayout, note: note || '', allCards: new Map(allCards.map((c) => [c.id, c])),
    checklists: lists2, comments, fields, fieldCtx
  };
}

// --- Page sections ------------------------------------------------------------------------

const kv = (rows) => el('dl', { class: 'p-kv' }, rows.filter(Boolean).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
const dot = (color) => el('span', { class: `p-dot ${color || 'light-gray'}`, 'aria-hidden': 'true' });

const RENDER = {
  handover: () => (handover.trim() ? el('div', { class: 'p-handover' }, renderNotes(handover)) : null),

  summary: (opts) => {
    const c = data.card;
    const pr = PRIORITIES[data.priority];
    return kv([
      ['Board', data.board.name || ''],
      ['List', data.list],
      c.start ? ['Start', formatDate(c.start)] : null,
      c.due ? ['Due', `${formatDateTime(c.due)}${c.dueComplete ? ' (done)' : ''}`] : null,
      pr ? ['Priority', el('span', {}, dot(pr.color), pr.label)] : null,
      (c.members || []).length ? ['Members', (c.members || []).map((m) => m.fullName || m.username).join(', ')] : null,
      (c.labels || []).length ? ['Labels', el('span', {}, (c.labels || []).map((l) => el('span', { class: 'p-label' }, dot(l.color), l.name || l.color)))] : null,
      opts.link && c.url ? ['Card link', el('span', { class: 'p-link' }, c.url)] : null
    ]);
  },

  description: () => (data.card.desc && data.card.desc.trim() ? renderNotes(data.card.desc) : null),

  fields: (opts) => {
    if (!data.fields) return data.authed ? null : el('p', { class: 'p-muted' }, 'Authorise Keel to include field values.');
    const all = data.fields.fields || [];
    const values = valuesWithComputed(all, data.fields.values || {}, data.card.id, data.fieldCtx || undefined);
    const shownIds = new Set(visibleFields(all, data.fields.visible).map((f) => f.id));
    const include = (f) => !isLayout(f) && (opts.show === 'all' || (opts.show === 'visible' ? shownIds.has(f.id) : !isEmpty(values[f.id]) || (f.type === 'checkbox' && shownIds.has(f.id))));
    const wrap = el('div');
    for (const g of groupFields(all)) {
      const items = g.items.filter((f) => f.type === 'header' || include(f));
      const rows = [];
      const blocks = [];
      const flush = () => { if (rows.length) { blocks.push(kv(rows.splice(0))); } };
      for (const f of items) {
        if (f.type === 'header') { flush(); blocks.push(el('h4', { class: 'p-subhead' }, f.name)); continue; }
        const v = values[f.id];
        if (f.type === 'notes' && !isEmpty(v)) { flush(); blocks.push(el('div', { class: 'p-notes' }, el('div', { class: 'p-notes-title' }, f.name), renderNotes(v))); continue; }
        let shown;
        if (isEmpty(v) && f.type !== 'checkbox') shown = el('span', { class: 'p-muted' }, '—');
        else if (f.type === 'choice') { const o = optionOf(f, v); shown = el('span', {}, dot(o && o.color), o ? o.label : ''); }
        else if (f.type === 'checkbox') shown = v ? '☑ Yes' : '☐ No';
        else shown = formatValue(f, v, { short: ['rating', 'progress', 'checklist'].includes(f.type), ctx: data.fieldCtx || undefined });
        rows.push([f.name, shown]);
      }
      flush();
      // Headings with nothing under them are dropped.
      const real = blocks.filter((b, i) => !(b.tagName === 'H4' && (i === blocks.length - 1 || blocks[i + 1].tagName === 'H4')));
      if (!real.some((b) => b.tagName !== 'H4')) continue;
      if (g.section) wrap.append(el('h3', { class: 'p-tabhead' }, g.section.name));
      wrap.append(...real);
    }
    return wrap.childNodes.length ? wrap : null;
  },

  crm: (opts) => {
    const tracks = summarize(data.crm, data.company, data.card.name);
    if (!tracks.length) return null;
    const head = el('tr', {}, ['Track', 'Stage', 'Since', 'Deadline', opts.notes ? 'Note' : null].filter(Boolean).map((h) => el('th', {}, h)));
    const period = tracks.find((s) => s.period);
    return el('div', {},
      period ? el('p', { class: 'p-muted' }, `Period end: ${formatDate(period.period)}`) : null,
      el('table', { class: 'p-table' }, el('thead', {}, head), el('tbody', {}, tracks.map((s) => el('tr', {},
        el('td', {}, TRACKS[s.key].label), el('td', {}, dot(s.color), s.stage), el('td', {}, s.changed ? formatDate(s.changed) : '—'),
        el('td', {}, s.due ? formatDate(s.due) : '—'), opts.notes ? el('td', {}, (data.crm[s.key] && data.crm[s.key].note) || '') : null)))));
  },

  company: (opts) => {
    const c = data.company;
    if (!c || !c.number) return null;
    return el('div', {},
      kv([
        ['Company', `${c.name || ''} (${c.number})`],
        ['Status', c.status || ''],
        c.address ? ['Registered office', c.address] : null,
        c.ard ? ['Year end', c.ard] : null,
        c.accountsDue ? ['Accounts due', `${formatDate(c.accountsDue)}${c.accountsOverdue ? ' — overdue' : ''}`] : null,
        c.csDue ? ['Confirmation statement due', `${formatDate(c.csDue)}${c.csOverdue ? ' — overdue' : ''}`] : null,
        c.ctPaymentDue ? ['Corporation tax payment (est.)', formatDate(c.ctPaymentDue)] : null,
        c.ctReturnDue ? ['CT600 return (est.)', formatDate(c.ctReturnDue)] : null
      ]),
      opts.officers && (c.officers || []).length ? el('div', {}, el('h4', { class: 'p-subhead' }, 'Officers'),
        el('ul', { class: 'p-list' }, c.officers.map((o) => el('li', {}, `${o.n} — ${o.r}${o.a ? `, since ${formatDate(o.a)}` : ''}`)))) : null);
  },

  checklists: (opts) => {
    if (!data.checklists) return data.authed ? null : el('p', { class: 'p-muted' }, 'Authorise Keel to include checklists.');
    const lists = data.checklists.filter((l) => (l.checkItems || []).length);
    if (!lists.length) return null;
    return el('div', {}, lists.map((l) => {
      const items = [...(l.checkItems || [])].sort((a, b) => a.pos - b.pos);
      const done = items.filter((i) => i.state === 'complete').length;
      const shown = opts.hideDone ? items.filter((i) => i.state !== 'complete') : items;
      return el('div', { class: 'p-checklist' }, el('h4', { class: 'p-subhead' }, `${l.name} (${done}/${items.length})`),
        shown.length ? el('ul', { class: 'p-checks' }, shown.map((i) => {
          const depth = (i.name.match(/^(↳ )+/) || [''])[0].length / 2;
          return el('li', { class: i.state === 'complete' ? 'done' : '', style: depth ? `margin-left:${depth * 16}px` : null }, i.state === 'complete' ? '☑ ' : '☐ ', i.name.replace(/^(↳ )+/, ''));
        })) : el('p', { class: 'p-muted' }, 'All items done.'));
    }));
  },

  subtasks: () => {
    const parent = data.parent && data.parent.id ? data.parent : null;
    const kids = data.children.map((id) => data.allCards.get(id)).filter(Boolean);
    if (!parent && !kids.length) return null;
    return el('div', {},
      parent ? el('p', {}, el('strong', {}, 'Part of: '), (data.allCards.get(parent.id) || parent).name) : null,
      kids.length ? el('ul', { class: 'p-checks' }, kids.map((k) => el('li', { class: k.dueComplete ? 'done' : '' }, k.dueComplete ? '☑ ' : '☐ ', k.name))) : null);
  },

  comments: (opts) => {
    if (!data.comments) return data.authed ? null : el('p', { class: 'p-muted' }, 'Authorise Keel to include comments.');
    const list = data.comments.slice(0, opts.count);
    if (!list.length) return null;
    return el('div', {}, list.map((a) => el('div', { class: 'p-comment' },
      el('div', { class: 'p-comment-meta' }, `${(a.memberCreator && a.memberCreator.fullName) || 'Someone'} · ${formatDateTime(a.date)}`),
      renderNotes((a.data && a.data.text) || ''))));
  },

  attachments: () => {
    const list = data.card.attachments || [];
    if (!list.length) return null;
    return el('ul', { class: 'p-list' }, list.map((a) => el('li', {}, a.name || a.url, a.url && a.name !== a.url ? el('span', { class: 'p-muted' }, ` — ${a.url}`) : null)));
  }
};

// --- Preview --------------------------------------------------------------------------

const pageStyle = el('style');
document.head.append(pageStyle);

function renderPage(target) {
  clear(target);
  const p = layout.page;
  pageStyle.textContent = `@page { size: ${p.size === 'Letter' ? 'letter' : 'A4'} portrait; margin: 14mm; }`;
  const page = el('article', { class: `p-page size-${p.size} font-${p.font}`, 'aria-label': 'Print preview' });
  page.append(el('header', { class: 'p-header' },
    el('h1', {}, data.card.name),
    el('div', { class: 'p-sub' }, [data.board.name, data.list].filter(Boolean).join(' › '))));
  let count = 0;
  for (const s of layout.sections) {
    if (!s.on) continue;
    const body = RENDER[s.id](s.opts);
    if (!body && p.skipEmpty) continue;
    count += 1;
    page.append(el('section', { class: `p-section p-sec-${s.id}` },
      s.id === 'handover' ? el('h2', {}, 'Handover note') : el('h2', {}, SECTIONS[s.id].label),
      body || el('p', { class: 'p-muted' }, 'Nothing to show.')));
  }
  if (!count) page.append(el('p', { class: 'p-muted' }, 'Nothing selected to print. Tick some sections on the left.'));
  if (p.footer) page.append(el('footer', { class: 'p-footer' }, `Prepared by ${data.me.fullName || data.me.username || 'Keel user'} on ${formatDateTime(new Date())} · ${data.card.url || ''}`));
  target.append(page);
}

// --- Editor ---------------------------------------------------------------------------

function render() {
  clear(app);
  const editor = el('aside', { class: 'print-editor no-print' });
  const preview = el('main', { class: 'print-preview' });
  app.append(el('div', { class: 'print-shell' }, editor, preview));

  const refresh = () => renderPage(preview);

  // Actions.
  editor.append(el('div', { class: 'print-actions' },
    el('button', { class: 'primary', onclick: () => window.print() }, '🖨 Print / save as PDF'),
    el('button', { class: 'small', title: 'Use this layout for every card on this board', onclick: async () => {
      try {
        await set(t, 'board', LAYOUT_KEY, compactLayout(layout));
        setStatus('Saved as the default layout for this board', 'success');
      } catch (err) { setStatus(`Could not save: ${err.message}`, 'error'); }
    } }, 'Save as board default'),
    el('button', { class: 'small', onclick: async () => {
      layout = data.savedLayout ? sanitizeLayout(data.savedLayout) : defaultLayout();
      render();
      setStatus(data.savedLayout ? 'Back to the board default layout' : 'Back to the standard layout');
    } }, 'Reset')));

  // Handover note.
  const note = el('textarea', { rows: '5', maxlength: String(HANDOVER_MAX), placeholder: 'What the next person needs to know: where things are, what is outstanding, who to contact…', 'aria-label': 'Handover note' });
  note.value = handover;
  const counter = el('small', { class: 'muted' }, `${handover.length}/${HANDOVER_MAX}`);
  let noteTimer;
  note.oninput = () => {
    handover = note.value;
    counter.textContent = `${handover.length}/${HANDOVER_MAX}`;
    refresh();
    clearTimeout(noteTimer);
    noteTimer = setTimeout(async () => {
      try {
        if (handover.trim()) await set(t, 'card', HANDOVER_KEY, handover);
        else await remove(t, 'card', HANDOVER_KEY);
        setStatus('Handover note saved on the card', 'success');
      } catch (err) {
        setStatus('This card has no room left for a note this long. Shorten it (it still prints).', 'error');
      }
    }, 600);
  };
  editor.append(el('fieldset', { class: 'fm-sec' }, el('legend', {}, 'Handover note'), note,
    el('div', { class: 'row between' }, el('small', { class: 'muted' }, 'Saved on the card. "- " lines become bullets.'), counter)));

  // Sections.
  const list = el('ol', { class: 'print-sections' });
  layout.sections.forEach((s, i) => {
    const def = SECTIONS[s.id];
    const box = el('input', { type: 'checkbox', checked: s.on, 'aria-label': `Print ${def.label}`, onchange: () => { s.on = box.checked; render(); } });
    const li = el('li', { class: s.on ? '' : 'off' },
      el('div', { class: 'row nowrap' }, box, el('span', { class: 'grow', title: def.hint }, def.label),
        el('button', { class: 'icon', 'aria-label': `Move ${def.label} up`, disabled: i === 0, onclick: () => { [layout.sections[i - 1], layout.sections[i]] = [s, layout.sections[i - 1]]; render(); } }, '↑'),
        el('button', { class: 'icon', 'aria-label': `Move ${def.label} down`, disabled: i === layout.sections.length - 1, onclick: () => { [layout.sections[i + 1], layout.sections[i]] = [s, layout.sections[i + 1]]; render(); } }, '↓')));
    if (s.on && def.opts) {
      const opts = el('div', { class: 'print-opts' });
      for (const [k, o] of Object.entries(def.opts)) {
        if (o.choices) {
          const sel = el('select', { 'aria-label': `${def.label}: ${o.label}`, onchange: () => { s.opts[k] = typeof o.default === 'number' ? Number(sel.value) : sel.value; refresh(); } },
            Object.entries(o.choices).map(([v, l]) => el('option', { value: v, selected: String(v) === String(s.opts[k]) }, l)));
          opts.append(el('label', { class: 'kv-row' }, el('span', {}, o.label), sel));
        } else {
          const cb = el('input', { type: 'checkbox', checked: !!s.opts[k], onchange: () => { s.opts[k] = cb.checked; refresh(); } });
          opts.append(el('label', { class: 'check-row' }, cb, el('span', {}, o.label)));
        }
      }
      li.append(opts);
    }
    list.append(li);
  });
  editor.append(el('fieldset', { class: 'fm-sec' }, el('legend', {}, 'What to print'), list));

  // Page.
  const page = el('div');
  for (const [k, o] of Object.entries(PAGE)) {
    if (o.choices) {
      const sel = el('select', { 'aria-label': o.label, onchange: () => { layout.page[k] = sel.value; refresh(); } },
        Object.entries(o.choices).map(([v, l]) => el('option', { value: v, selected: v === layout.page[k] }, l)));
      page.append(el('label', { class: 'kv-row' }, el('span', {}, o.label), sel));
    } else {
      const cb = el('input', { type: 'checkbox', checked: !!layout.page[k], onchange: () => { layout.page[k] = cb.checked; refresh(); } });
      page.append(el('label', { class: 'check-row' }, cb, el('span', {}, o.label)));
    }
  }
  editor.append(el('fieldset', { class: 'fm-sec' }, el('legend', {}, 'Page'), page));
  if (!data.authed) editor.append(el('p', { class: 'notice' }, 'Checklists, comments and field values need Keel to be authorised (Power-Up settings → Authorise).'));

  refresh();
}

t.render(async () => {
  if (data) return; // keep the editor as it is while open
  try {
    data = await loadData();
    layout = data.savedLayout ? sanitizeLayout(data.savedLayout) : defaultLayout();
    handover = data.note;
    render();
  } catch (err) {
    app.append(el('p', { class: 'status error' }, err.message || String(err)));
  }
});
