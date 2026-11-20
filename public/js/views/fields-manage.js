// "Add / edit fields": field list (drag to reorder), a gallery of field types,
// the editor for the selected field, and a live preview on one of the board's cards.
import { api, TYPES, TEMPLATES, COLORS, NUMBER_FORMATS, WIDTHS, newId, isLayout, fromTemplate, sampleValue, markBoardChanged } from '../lib/fields.js';
import { renderForm, editorFor, typeIcon } from '../lib/field-ui.js';
import { clear, el, setStatus } from '../lib/util.js';

// Types a field can switch between without losing the meaning of its values.
const FAMILIES = [['text', 'notes', 'url', 'email', 'phone'], ['choice', 'multi'], ['number', 'progress', 'rating'], ['date'], ['checkbox'], ['section'], ['header']];
const family = (type) => FAMILIES.find((f) => f.includes(type)) || [type];

let view = 'edit'; // 'edit' | 'gallery'
let galleryQuery = '';
let galleryGroup = 'All';
let previewCardId = null;

export function drawManage(root, ctx) {
  if (!ctx.draft) ctx.draft = JSON.parse(JSON.stringify(ctx.board.fields || []));
  const draft = ctx.draft;
  if (!draft.some((f) => f.id === ctx.selected)) ctx.selected = draft.length ? draft[0].id : null;
  if (!draft.length) view = 'gallery';

  const saveBar = el('div', { class: 'savebar' });
  const side = el('aside', { class: 'fm-side' });
  const main = el('section', { class: 'fm-main' });
  const preview = el('aside', { class: 'fm-preview' });
  root.append(saveBar, el('div', { class: 'fm' }, side, main, preview));

  const selected = () => draft.find((f) => f.id === ctx.selected) || null;
  const touch = ({ full = false } = {}) => {
    ctx.dirty = true;
    drawSaveBar();
    drawSide();
    drawPreview();
    if (full) drawMain();
  };

  // --- Save bar -------------------------------------------------------------
  function drawSaveBar() {
    clear(saveBar);
    saveBar.append(...[
      el('span', { class: ctx.dirty ? 'unsaved' : 'muted' }, ctx.dirty ? '● Unsaved changes' : `${draft.filter((f) => !isLayout(f)).length} fields · changes are saved for everyone on this board`),
      el('span', { class: 'grow' }),
      ctx.dirty ? el('button', { onclick: () => { ctx.draft = null; ctx.dirty = false; clear(root); drawManage(root, ctx); } }, 'Discard') : null,
      el('button', { class: 'primary', disabled: !ctx.dirty, onclick: save }, 'Save fields')].filter(Boolean));
  }

  async function save() {
    const clean = draft.map((f) => ({ ...f, name: (f.name || '').trim(), options: f.options ? f.options.map((o) => ({ ...o, label: (o.label || '').trim() })) : undefined }));
    const missing = clean.find((f) => !f.name);
    if (missing) { ctx.selected = missing.id; view = 'edit'; drawSide(); drawMain(); return setStatus('Every field needs a name', 'error'); }
    const emptyOpt = clean.find((f) => f.options && f.options.some((o) => !o.label));
    if (emptyOpt) { ctx.selected = emptyOpt.id; view = 'edit'; drawSide(); drawMain(); return setStatus(`Every option of "${emptyOpt.name}" needs a label`, 'error'); }
    setStatus('Saving…');
    try {
      const res = await api.saveFields(ctx.t, ctx.boardId, clean, ctx.board.updatedAt || 0);
      ctx.board.fields = res.fields;
      ctx.board.updatedAt = res.updatedAt;
      ctx.draft = JSON.parse(JSON.stringify(res.fields));
      ctx.dirty = false;
      ctx.selfWriteAt = Date.now();
      await markBoardChanged(ctx.t);
      clear(root);
      drawManage(root, ctx);
      setStatus('Fields saved', 'success');
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  // --- Sidebar --------------------------------------------------------------
  let dragId = null;
  function drawSide() {
    clear(side);
    side.append(el('div', { class: 'row between fm-side-head' }, el('strong', {}, 'Fields'),
      el('button', { class: 'primary small', onclick: () => { view = 'gallery'; drawSide(); drawMain(); } }, '+ Add')));
    const list = el('ul', { class: 'fm-list', role: 'listbox', 'aria-label': 'Fields' });
    let inSection = false;
    for (const f of draft) {
      if (f.type === 'section') inSection = true;
      const li = el('li', {
        class: `${f.id === ctx.selected && view === 'edit' ? 'selected' : ''}${inSection && f.type !== 'section' ? ' nested' : ''}${f.type === 'section' ? ' is-section' : ''}`,
        role: 'option', tabindex: '0', draggable: 'true', 'aria-selected': String(f.id === ctx.selected),
        onclick: () => { ctx.selected = f.id; view = 'edit'; drawSide(); drawMain(); },
        onkeydown: (e) => {
          if (e.key === 'Enter') e.currentTarget.click();
          if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(f.id, e.key === 'ArrowUp' ? -1 : 1); }
        },
        ondragstart: (e) => { dragId = f.id; e.dataTransfer.effectAllowed = 'move'; },
        ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('drop'); },
        ondragleave: (e) => e.currentTarget.classList.remove('drop'),
        ondrop: (e) => {
          e.preventDefault();
          if (!dragId || dragId === f.id) return;
          const from = draft.findIndex((x) => x.id === dragId);
          const [item] = draft.splice(from, 1);
          draft.splice(draft.findIndex((x) => x.id === f.id), 0, item);
          dragId = null;
          touch({ full: true });
        }
      }, typeIcon(f.type), el('span', { class: 'grow' }, f.name || el('em', { class: 'muted' }, 'Untitled')),
      !isLayout(f) && f.badge ? el('span', { class: 'mini-flag', title: 'Shown on the card front' }, '▣') : null,
      !isLayout(f) && f.shown === false ? el('span', { class: 'mini-flag', title: 'Hidden on new cards' }, '◌') : null);
      list.append(li);
    }
    side.append(list);
    if (draft.length > 1) side.append(el('small', { class: 'muted' }, 'Drag to reorder. Fields under a section tab appear inside that tab.'));
  }

  function move(id, d) {
    const i = draft.findIndex((f) => f.id === id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= draft.length) return;
    [draft[i], draft[j]] = [draft[j], draft[i]];
    touch({ full: true });
  }

  // --- Main: gallery or editor ------------------------------------------------
  function drawMain() {
    clear(main);
    if (view === 'gallery') return drawGallery();
    const f = selected();
    if (!f) { main.append(el('p', { class: 'muted' }, 'Add your first field with "+ Add".')); return; }
    drawEditor(f);
  }

  function drawGallery() {
    const groups = ['All', ...new Set(TEMPLATES.map((x) => x.group))];
    const search = el('input', { type: 'search', placeholder: 'Search field types…', value: galleryQuery, 'aria-label': 'Search field types', oninput: () => { galleryQuery = search.value; drawCards(); } });
    const chips = el('div', { class: 'filter-chips' });
    const cards = el('div');
    const drawChips = () => {
      clear(chips);
      for (const g of groups) {
        const n = g === 'All' ? TEMPLATES.length : TEMPLATES.filter((x) => x.group === g).length;
        chips.append(el('button', { class: g === galleryGroup ? 'active' : '', onclick: () => { galleryGroup = g; drawChips(); drawCards(); } }, g, el('span', { class: 'count' }, String(n))));
      }
    };
    const drawCards = () => {
      clear(cards);
      const q = galleryQuery.trim().toLowerCase();
      for (const g of groups.slice(1)) {
        if (galleryGroup !== 'All' && galleryGroup !== g) continue;
        const items = TEMPLATES.filter((x) => x.group === g && (!q || `${x.name} ${x.desc}`.toLowerCase().includes(q)));
        if (!items.length) continue;
        cards.append(el('h3', { class: 'gallery-h' }, g));
        const grid = el('div', { class: 'gallery' });
        for (const tpl of items) {
          const sampleField = fromTemplate(tpl);
          const sample = isLayout(sampleField)
            ? el('div', { class: sampleField.type === 'header' ? 'fheader c-blue' : 'ftabs mini' }, sampleField.type === 'header' ? 'Heading' : el('button', { class: 'active', type: 'button' }, 'Section'))
            : editorFor(sampleField, sampleValue(tpl, sampleField), async () => false, { readOnly: true, compact: true });
          grid.append(el('div', { class: 'gcard' },
            el('div', { class: 'row nowrap' }, typeIcon(sampleField.type), el('div', { class: 'grow' }, el('strong', {}, tpl.name), el('div', {}, el('small', { class: 'muted' }, tpl.desc))),
              el('button', { class: 'small', 'aria-label': `Add ${tpl.name}`, onclick: () => add(tpl) }, '+ Add')),
            el('div', { class: 'gsample' }, sample)));
        }
        cards.append(grid);
      }
      if (!cards.childNodes.length) cards.append(el('p', { class: 'muted' }, 'No field types match.'));
    };
    main.append(el('div', { class: 'row' }, el('div', { class: 'grow' }, search), draft.length ? el('button', { onclick: () => { view = 'edit'; drawSide(); drawMain(); } }, 'Cancel') : null), chips, cards);
    drawChips();
    drawCards();
  }

  function add(tpl) {
    const field = fromTemplate(tpl);
    const at = draft.findIndex((f) => f.id === ctx.selected);
    draft.splice(at >= 0 ? at + 1 : draft.length, 0, field);
    ctx.selected = field.id;
    view = 'edit';
    touch({ full: true });
    const nameInput = main.querySelector('input.fname');
    if (nameInput) { nameInput.focus(); nameInput.select(); }
  }

  function section(title, ...children) {
    return el('fieldset', { class: 'fm-sec' }, el('legend', {}, title), ...children);
  }

  function check(label, checked, onchange, { disabled = false, hint = '' } = {}) {
    const box = el('input', { type: 'checkbox', checked, disabled, onchange: () => onchange(box.checked) });
    return el('label', { class: 'check-row', title: hint }, box, el('span', {}, label), hint ? el('small', { class: 'muted' }, ` ${hint}`) : null);
  }

  function select(label, value, options, onchange) {
    const sel = el('select', { onchange: () => onchange(sel.value) }, Object.entries(options).map(([k, v]) => el('option', { value: k, selected: k === value }, v)));
    return el('label', { class: 'kv-row' }, el('span', {}, label), sel);
  }

  function colorPicker(label, value, onchange) {
    const row = el('div', { class: 'swatches', role: 'radiogroup', 'aria-label': label });
    for (const c of ['', ...COLORS]) {
      row.append(el('button', { type: 'button', role: 'radio', 'aria-checked': String(c === (value || '')), class: `swatch-btn ${c ? `bg-${c}` : 'none'}${c === (value || '') ? ' on' : ''}`, title: c || 'None',
        onclick: () => onchange(c) }, c ? '' : '∅'));
    }
    return el('div', { class: 'kv-row' }, el('span', {}, label), row);
  }

  function drawEditor(f) {
    const i = draft.indexOf(f);
    const name = el('input', { type: 'text', class: 'fname', maxlength: '60', value: f.name, placeholder: 'Field name', 'aria-label': 'Field name', oninput: () => { f.name = name.value; touch(); } });
    let confirmDelete = false;
    const del = el('button', { class: 'small', onclick: () => {
      if (!confirmDelete) { confirmDelete = true; del.textContent = 'Click again to delete'; del.classList.add('danger'); return; }
      draft.splice(i, 1);
      ctx.selected = draft[Math.max(0, i - 1)] ? draft[Math.max(0, i - 1)].id : null;
      touch({ full: true });
    } }, '🗑 Delete field');
    main.append(el('div', { class: 'row fm-head' }, typeIcon(f.type), el('div', { class: 'grow' }, name),
      el('button', { class: 'icon', title: 'Move up (Alt+↑)', 'aria-label': 'Move up', disabled: i === 0, onclick: () => move(f.id, -1) }, '↑'),
      el('button', { class: 'icon', title: 'Move down (Alt+↓)', 'aria-label': 'Move down', disabled: i === draft.length - 1, onclick: () => move(f.id, 1) }, '↓'),
      el('button', { class: 'small', onclick: () => {
        const copy = JSON.parse(JSON.stringify(f));
        copy.id = newId();
        copy.name = `${f.name} (copy)`.slice(0, 60);
        if (copy.options) copy.options = copy.options.map((o) => ({ ...o, id: newId() }));
        draft.splice(i + 1, 0, copy);
        ctx.selected = copy.id;
        touch({ full: true });
      } }, '⧉ Clone field'), del));
    main.append(el('p', { class: 'muted fm-hint' }, TYPES[f.type].hint));

    // General
    const general = [];
    const fam = family(f.type);
    if (fam.length > 1) {
      general.push(select('Editor style', f.type === 'choice' ? `choice:${f.display || 'buttons'}` : f.type,
        Object.fromEntries(fam.flatMap((ty) => (ty === 'choice' ? [['choice:buttons', 'Segment buttons (pick one)'], ['choice:dropdown', 'Dropdown (pick one)']] : [[ty, TYPES[ty].label + (ty === 'multi' ? ' (pick several)' : '')]]))),
        (v) => {
          const [ty, display] = v.split(':');
          f.type = ty;
          if (ty === 'choice') f.display = display;
          if (ty === 'notes') f.badge = false;
          if ((ty === 'choice' || ty === 'multi') && !(f.options && f.options.length)) f.options = [{ id: newId(), label: 'Option 1', color: 'blue' }];
          if (ty === 'rating' && !f.max) f.max = 5;
          if (ty === 'number' && !f.format) { f.format = 'plain'; f.decimals = 2; }
          touch({ full: true });
        }));
    }
    if (f.type === 'number') {
      general.push(select('Format', f.format || 'plain', NUMBER_FORMATS, (v) => { f.format = v; touch(); }));
      general.push(select('Decimal places', String(Number.isInteger(f.decimals) ? f.decimals : 2), { 0: '0', 1: '1', 2: '2', 3: '3', 4: '4' }, (v) => { f.decimals = Number(v); touch(); }));
    }
    if (f.type === 'rating') general.push(select('Number of stars', String(f.max || 5), Object.fromEntries([3, 4, 5, 6, 7, 8, 9, 10].map((n) => [String(n), String(n)])), (v) => { f.max = Number(v); touch(); }));
    if (f.type === 'date') general.push(check('Deadline colours', f.deadline !== false, (v) => { f.deadline = v; touch(); }, { hint: 'green → yellow → orange → red as the date nears' }));
    if (f.type === 'section') general.push(check('Hide tab content by default', !!f.collapsed, (v) => { f.collapsed = v; touch(); }, { hint: 'the tab starts closed on each card' }));
    if (general.length) main.append(section('General', ...general));

    // Options
    if (f.type === 'choice' || f.type === 'multi') {
      const list = el('div', { class: 'opt-list' });
      f.options.forEach((o, k) => {
        const label = el('input', { type: 'text', maxlength: '40', value: o.label, placeholder: `Option ${k + 1}`, 'aria-label': 'Option label', oninput: () => { o.label = label.value; touch(); } });
        const color = el('select', { 'aria-label': 'Colour', onchange: () => { o.color = color.value; sw.className = `pill swatch ${o.color}`; touch(); } }, COLORS.map((c) => el('option', { value: c, selected: c === o.color }, c)));
        const sw = el('span', { class: `pill swatch ${o.color}`, 'aria-hidden': 'true' });
        list.append(el('div', { class: 'row nowrap opt-row' }, sw, el('div', { class: 'grow' }, label), el('div', {}, color),
          el('button', { class: 'icon', 'aria-label': 'Move option up', disabled: k === 0, onclick: () => { [f.options[k - 1], f.options[k]] = [f.options[k], f.options[k - 1]]; touch({ full: true }); } }, '↑'),
          el('button', { class: 'icon', 'aria-label': 'Remove option', disabled: f.options.length < 2, onclick: () => { f.options.splice(k, 1); touch({ full: true }); } }, '×')));
      });
      list.append(el('button', { class: 'small', onclick: () => { f.options.push({ id: newId(), label: '', color: COLORS[f.options.length % COLORS.length] }); touch({ full: true }); const inputs = main.querySelectorAll('.opt-row input'); if (inputs.length) inputs[inputs.length - 1].focus(); } }, '+ Add option'));
      main.append(section('Options', list));
    }

    if (!isLayout(f)) {
      // Display
      const help = el('input', { type: 'text', maxlength: '300', value: f.help || '', placeholder: 'Optional help text shown under the field', oninput: () => { f.help = help.value; touch(); } });
      const ph = el('input', { type: 'text', maxlength: '100', value: f.placeholder || '', placeholder: 'Optional text shown while the field is empty', oninput: () => { f.placeholder = ph.value; touch(); } });
      main.append(section('Display',
        check('Show field value on card front', !!f.badge, (v) => { f.badge = v; touch({ full: true }); }, { disabled: f.type === 'notes', hint: f.type === 'notes' ? 'notes are too long for a badge' : '' }),
        check('Show field name on card front', !!f.badgeName, (v) => { f.badgeName = v; touch(); }, { disabled: !f.badge || f.type === 'checkbox' }),
        check('Hide field on new cards by default', f.shown === false, (v) => { f.shown = !v; touch(); }, { hint: 'cards can still show it with "Visible fields"' }),
        f.type !== 'checkbox' ? check('Required', !!f.required, (v) => { f.required = v; touch(); }, { hint: 'turns red while empty' }) : null,
        el('label', { class: 'kv-row' }, el('span', {}, 'Help text'), help),
        el('label', { class: 'kv-row' }, el('span', {}, 'Placeholder'), ph)));
      // Layout
      main.append(section('Field editor layout',
        select('Editor width', f.width || 'full', WIDTHS, (v) => { f.width = v; touch(); }),
        select('Label position', f.label || 'top', { top: 'Label on top', left: 'Label on the left' }, (v) => { f.label = v; touch(); }),
        colorPicker('Background colour', f.color, (c) => { f.color = c; touch({ full: true }); })));
    } else {
      main.append(section('Colour', colorPicker(f.type === 'section' ? 'Tab colour' : 'Heading colour', f.color, (c) => { f.color = c; touch({ full: true }); })));
    }
  }

  // --- Live preview ---------------------------------------------------------
  function drawPreview() {
    clear(preview);
    const cards = ctx.trello.cards;
    if (!previewCardId || !cards.some((c) => c.id === previewCardId)) {
      const withValues = cards.find((c) => ctx.board.cards[c.id] && Object.keys(ctx.board.cards[c.id].values || {}).length);
      previewCardId = (withValues || cards[0] || {}).id || null;
    }
    const sel = el('select', { 'aria-label': 'Preview card', onchange: () => { previewCardId = sel.value; drawPreview(); } },
      cards.map((c) => el('option', { value: c.id, selected: c.id === previewCardId }, c.name)));
    const card = ctx.board.cards[previewCardId] || { values: {}, visible: null };
    const known = new Set(draft.map((f) => f.id));
    const visible = Array.isArray(card.visible) ? card.visible.concat(draft.filter((f) => !ctx.board.fields.some((x) => x.id === f.id)).map((f) => f.id)).filter((id) => known.has(id)) : null;
    preview.append(el('label', {}, 'Preview card'), sel,
      el('div', { class: 'preview-card' }, el('div', { class: 'preview-title' }, '▤ Keel · Fields'),
        draft.some((f) => !isLayout(f)) ? renderForm(draft, card.values || {}, async () => false, { readOnly: true, visible, state: {} }) : el('p', { class: 'muted' }, 'Add a field to see it here.')),
      el('small', { class: 'muted' }, 'Shows this card with your unsaved changes. Values are edited on the card itself.'));
  }

  drawSaveBar();
  drawSide();
  drawMain();
  drawPreview();
}
