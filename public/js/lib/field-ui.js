// Field editors and the card form layout (sections as tabs, headings, widths,
// label position, colours). Used by the card's Fields tab, the live preview and
// gallery in Manage fields, and inline editing in the table.
import { TYPES, isLayout, isEmpty, optionOf, visibleFields, renderNotes, formatNumber, formatValue } from './fields.js';
import { el, clear, toDateInput, daysUntil, deadlineColor } from './util.js';

const PREFIX = { gbp: '£', eur: '€', usd: '$' };

/**
 * One field's editor. `commit(value)` saves and resolves to true on success.
 * options: { readOnly, compact, fit }
 */
export function editorFor(field, value, commit, options = {}) {
  const { readOnly = false, compact = false, fit = () => {} } = options;
  let cur = value;
  const wrap = el('div', { class: `editor editor-${field.type}${compact ? ' compact' : ''}` });
  const save = async (next) => {
    if (readOnly) return false;
    const ok = await commit(next);
    if (ok !== false) { cur = next; draw(); }
    return ok;
  };
  const input = (type, attrs = {}) => {
    const node = el('input', { type, value: cur ?? '', placeholder: field.placeholder || '', disabled: readOnly, 'aria-label': field.name, ...attrs });
    node.onchange = () => save(node.value.trim() === '' ? null : node.value.trim());
    node.onkeydown = (e) => { if (e.key === 'Enter') node.blur(); };
    return node;
  };
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener noreferrer', class: 'field-link', title: text }, '↗');

  function draw() {
    clear(wrap);
    switch (field.type) {
      case 'choice': {
        if (field.display === 'dropdown') {
          const sel = el('select', { disabled: readOnly, 'aria-label': field.name, onchange: () => save(sel.value || null) },
            el('option', { value: '' }, field.placeholder || '—'),
            (field.options || []).map((o) => el('option', { value: o.id, selected: o.id === cur }, o.label)));
          const o = optionOf(field, cur);
          wrap.append(el('div', { class: 'row nowrap' }, el('div', { class: 'grow' }, sel), o ? el('span', { class: `pill ${o.color}` }, o.label) : null));
        } else {
          const group = el('div', { class: 'segmented', role: 'group', 'aria-label': field.name });
          for (const o of field.options || []) {
            const on = cur === o.id;
            group.append(el('button', { type: 'button', class: on ? `on ${o.color}` : '', 'aria-pressed': String(on), disabled: readOnly, title: on ? 'Click again to clear' : '',
              onclick: () => save(on ? null : o.id) }, o.label));
          }
          wrap.append(group);
        }
        if (cur && !optionOf(field, cur)) wrap.append(el('small', { class: 'muted' }, ' (option removed)'));
        break;
      }
      case 'multi': {
        const picked = new Set(Array.isArray(cur) ? cur : []);
        const chips = el('div', { class: 'chips', role: 'group', 'aria-label': field.name });
        for (const o of field.options || []) {
          const on = picked.has(o.id);
          chips.append(el('button', { type: 'button', class: `chip ${o.color}${on ? ' on' : ''}`, 'aria-pressed': String(on), disabled: readOnly,
            onclick: () => { const next = new Set(picked); if (on) next.delete(o.id); else next.add(o.id); save(next.size ? (field.options || []).map((x) => x.id).filter((id) => next.has(id)) : null); } }, o.label));
        }
        wrap.append(chips);
        break;
      }
      case 'checkbox': {
        const box = el('input', { type: 'checkbox', checked: !!cur, disabled: readOnly, 'aria-label': field.name, onchange: () => save(box.checked) });
        wrap.append(el('label', { class: 'row nowrap check' }, box, el('span', {}, cur ? 'Yes' : 'No')));
        break;
      }
      case 'rating': {
        const max = field.max || 5;
        const n = Number(cur) || 0;
        const row = el('div', { class: 'stars', role: 'group', 'aria-label': field.name });
        for (let i = 1; i <= max; i += 1) {
          row.append(el('button', { type: 'button', class: i <= n ? 'on' : '', disabled: readOnly, 'aria-label': `${i} of ${max}`, title: i === n ? 'Click again to clear' : `${i} of ${max}`,
            onclick: () => save(i === n ? null : i) }, i <= n ? '★' : '☆'));
        }
        wrap.append(row);
        break;
      }
      case 'progress': {
        const v = Number(cur) || 0;
        const range = el('input', { type: 'range', min: '0', max: '100', step: '5', value: String(v), disabled: readOnly, 'aria-label': field.name });
        const num = el('span', { class: 'muted' }, `${v}%`);
        range.oninput = () => { num.textContent = `${range.value}%`; };
        range.onchange = () => save(Number(range.value) || null);
        wrap.append(el('div', { class: 'progress-edit row nowrap' }, el('div', { class: 'grow' }, el('div', { class: 'progress' }, el('span', { style: `width:${v}%` })), range), num));
        break;
      }
      case 'date': {
        const inp = input('date', { value: toDateInput(cur) });
        const row = el('div', { class: 'row nowrap' }, el('div', { class: 'grow' }, inp));
        if (cur && field.deadline !== false) {
          const days = daysUntil(cur);
          row.append(el('span', { class: `pill ${deadlineColor(cur)}` }, days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? 'today' : `in ${days}d`));
        }
        wrap.append(row);
        break;
      }
      case 'number': {
        const inp = input('number', { step: 'any' });
        inp.onchange = () => save(inp.value === '' ? null : Number(inp.value));
        const pre = PREFIX[field.format];
        wrap.append(el('div', { class: 'affix row nowrap' }, pre ? el('span', { class: 'muted' }, pre) : null, el('div', { class: 'grow' }, inp),
          field.format === 'percent' ? el('span', { class: 'muted' }, '%') : null,
          !compact && typeof cur === 'number' && field.format !== 'plain' ? el('small', { class: 'muted' }, formatNumber(field, cur)) : null));
        break;
      }
      case 'url':
      case 'email':
      case 'phone': {
        const inp = input(field.type === 'url' ? 'url' : field.type === 'email' ? 'email' : 'tel');
        const href = !cur ? null : field.type === 'url' ? cur : field.type === 'email' ? `mailto:${cur}` : `tel:${String(cur).replace(/[^0-9+]/g, '')}`;
        wrap.append(el('div', { class: 'row nowrap' }, el('div', { class: 'grow' }, inp), href ? link(href, cur) : null));
        break;
      }
      case 'notes':
        notes();
        break;
      default:
        wrap.append(input('text'));
    }
    fit();
  }

  function notes() {
    const view = () => {
      clear(wrap);
      const shown = !isEmpty(cur) ? renderNotes(cur) : el('p', { class: 'muted placeholder' }, readOnly ? '—' : (field.placeholder ? field.placeholder.split('\n')[0] : 'Click to add notes'));
      shown.classList.add('notes-view');
      if (!readOnly) {
        shown.title = 'Click to edit';
        shown.tabIndex = 0;
        shown.setAttribute('role', 'button');
        shown.onclick = edit;
        shown.onkeydown = (e) => { if (e.key === 'Enter') edit(); };
      }
      wrap.append(shown);
      fit();
    };
    const edit = () => {
      clear(wrap);
      const area = el('textarea', { rows: String(Math.min(16, Math.max(compact ? 3 : 5, String(cur || '').split('\n').length + 1))), 'aria-label': field.name, placeholder: field.placeholder || 'Heading:\n- first point\n- second point' });
      area.value = cur || '';
      const done = async () => {
        const next = area.value;
        if (next === (cur || '')) return view();
        const ok = await commit(next.trim() ? next : null);
        if (ok !== false) { cur = next.trim() ? next : null; view(); }
      };
      area.onkeydown = (e) => { if (e.key === 'Escape') view(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) done(); };
      wrap.append(area, el('div', { class: 'row', style: 'margin-top:4px' },
        el('button', { type: 'button', class: 'primary small', onclick: done }, 'Save'),
        el('button', { type: 'button', class: 'small', onclick: view }, 'Cancel'),
        el('small', { class: 'muted' }, '"- " makes a bullet · "Heading:" a heading · **bold** · Ctrl+Enter saves')));
      fit();
      area.focus();
    };
    view();
  }

  draw();
  return wrap;
}

/** Group fields: fields before the first section, then one group per section. */
export function groupFields(fields) {
  const groups = [{ section: null, items: [] }];
  for (const f of fields) {
    if (f.type === 'section') groups.push({ section: f, items: [] });
    else groups[groups.length - 1].items.push(f);
  }
  return groups;
}

function fieldCell(field, value, onCommit, options) {
  const empty = isEmpty(value) && field.type !== 'checkbox';
  const cell = el('div', { class: `fcell w-${field.width || 'full'}${field.label === 'left' ? ' label-left' : ''}${field.color ? ` bg-${field.color}` : ''}${field.required && empty ? ' missing' : ''}`, 'data-field': field.id });
  const label = el('div', { class: 'flabel' }, el('span', {}, field.name), field.required ? el('span', { class: 'req', title: 'Required' }, ' *') : null);
  const body = el('div', { class: 'fbody' });
  const commit = async (next) => {
    const ok = await onCommit(field, next);
    if (ok !== false) cell.classList.toggle('missing', !!field.required && isEmpty(next) && field.type !== 'checkbox');
    return ok;
  };
  body.append(editorFor(field, value, commit, options));
  if (field.help) body.append(el('small', { class: 'muted help' }, field.help));
  cell.append(label, body);
  return cell;
}

/**
 * The card form. options: { visible, readOnly, fit, state } where `state.section`
 * remembers the open section tab between redraws.
 */
export function renderForm(fields, values, onCommit, options = {}) {
  const { visible = null, state = {}, fit = () => {} } = options;
  const shown = new Set(visibleFields(fields, visible).map((f) => f.id));
  const root = el('div', { class: 'fform' });

  const renderItems = (items) => {
    const grid = el('div', { class: 'fgrid' });
    items.forEach((f, i) => {
      if (f.type === 'header') {
        // A heading shows when at least one field under it (until the next heading) is shown.
        const rest = items.slice(i + 1);
        const end = rest.findIndex((x) => x.type === 'header');
        if (!(end === -1 ? rest : rest.slice(0, end)).some((x) => shown.has(x.id))) return;
        grid.append(el('div', { class: `fheader${f.color ? ` c-${f.color}` : ''}` }, f.name));
      } else if (shown.has(f.id)) {
        grid.append(fieldCell(f, values[f.id], onCommit, options));
      }
    });
    return grid;
  };

  const groups = groupFields(fields);
  root.append(renderItems(groups[0].items));
  const sections = groups.slice(1).filter((g) => g.items.some((f) => shown.has(f.id)));
  if (sections.length) {
    if (!sections.some((g) => g.section.id === state.section)) {
      const first = sections.find((g) => !g.section.collapsed);
      state.section = first ? first.section.id : null;
    }
    const bar = el('div', { class: 'ftabs', role: 'tablist' });
    const pane = el('div', { class: 'fpane' });
    const draw = () => {
      clear(bar); clear(pane);
      for (const g of sections) {
        const active = g.section.id === state.section;
        const count = g.items.filter((f) => shown.has(f.id) && !isEmpty(values[f.id])).length;
        bar.append(el('button', { type: 'button', role: 'tab', 'aria-selected': String(active), class: `${active ? 'active' : ''}${g.section.color ? ` c-${g.section.color}` : ''}`,
          onclick: () => { state.section = active ? null : g.section.id; draw(); fit(); } }, g.section.name, count ? el('span', { class: 'count' }, String(count)) : null));
      }
      const g = sections.find((x) => x.section.id === state.section);
      if (g) pane.append(renderItems(g.items));
      else pane.append(el('p', { class: 'muted', style: 'margin:6px 2px' }, el('small', {}, 'Click a tab to show its fields.')));
    };
    draw();
    root.append(bar, pane);
  }
  if (!shown.size) root.append(el('p', { class: 'muted' }, 'No fields are shown on this card. Use "Visible fields" to pick some.'));
  return root;
}

/** Small read-only rendering of a value for table cells and previews. */
export function valueView(field, value) {
  if (isEmpty(value) && field.type !== 'checkbox') return el('span', { class: 'muted' }, '—');
  switch (field.type) {
    case 'choice': { const o = optionOf(field, value); return o ? el('span', { class: `pill ${o.color}` }, o.label) : el('span', { class: 'muted' }, '—'); }
    case 'multi': return el('span', { class: 'chips' }, (value || []).map((v) => optionOf(field, v)).filter(Boolean).map((o) => el('span', { class: `pill ${o.color}` }, o.label)));
    case 'checkbox': return el('span', { class: value ? 'tick on' : 'tick' }, value ? '✓' : '');
    case 'rating': return el('span', { class: 'stars-view' }, formatValue(field, value, { short: true }));
    case 'progress': return el('span', { class: 'row nowrap' }, el('span', { class: 'progress small' }, el('span', { style: `width:${value}%` })), el('small', {}, `${value}%`));
    case 'date': return el('span', { class: field.deadline !== false ? `pill ${deadlineColor(value)}` : '' }, formatValue(field, value));
    case 'url': return el('a', { href: value, target: '_blank', rel: 'noopener noreferrer', onclick: (e) => e.stopPropagation() }, formatValue(field, value, { short: true }));
    case 'email': return el('a', { href: `mailto:${value}`, onclick: (e) => e.stopPropagation() }, value);
    case 'notes': return el('span', { title: String(value) }, formatValue(field, value, { short: true }));
    default: return el('span', {}, formatValue(field, value));
  }
}

export function typeIcon(type) {
  return el('span', { class: `ticon t-${type}`, 'aria-hidden': 'true' }, (TYPES[type] || TYPES.text).icon);
}

export { isLayout };
