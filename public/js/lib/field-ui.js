// Field editors and the card form layout (sections as tabs, headings, widths,
// label position, colours). Used by the card's Fields tab, the live preview and
// gallery in Manage fields, and inline editing in the table.
import { TYPES, isLayout, isComputed, isEmpty, optionOf, visibleFields, renderNotes, formatValue, progressBar, emptyContext, SAMPLE_MEMBER, SAMPLE_CARD } from './fields.js';
import { RATING_STYLES, TOGGLE_STYLES, DATE_FORMATS, numberFormatOf, formatNumberValue, scaleColor, dateKind, toDate, dayOf, dateColor, parseDuration, formatDuration } from './field-styles.js';
import { el, clear, deadlineColor, bindDateCommit } from './util.js';

const pad = (n) => String(n).padStart(2, '0');

/** Value for an <input> of the field's date kind. */
function dateInputValue(field, value) {
  const kind = dateKind(field);
  const d = toDate(kind, value);
  if (!d) return '';
  if (kind === 'time') return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (field.format === 'monthYearShort') return day.slice(0, 7);
  if (field.format === 'yearOnly') return String(d.getFullYear());
  return kind === 'datetime' ? `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
}

/** Stored value from an <input> of the field's date kind. */
function dateFromInput(field, raw) {
  if (!raw) return null;
  const kind = dateKind(field);
  if (kind === 'time') return raw;
  if (kind === 'datetime') { const d = new Date(raw); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
  if (field.format === 'monthYearShort') return `${raw}-01`;
  if (field.format === 'yearOnly') return /^\d{4}$/.test(raw) ? `${raw}-01-01` : null;
  return raw;
}

function initials(name) {
  return String(name || '?').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function avatar(member) {
  return el('span', { class: 'avatar', title: member.fullName || member.username }, initials(member.fullName || member.username));
}

/** Toggle button content for a style. */
function toggleFace(style, on) {
  const s = TOGGLE_STYLES[style] || TOGGLE_STYLES.checkbox;
  if (s.switch) return el('span', { class: `switch${on ? ' on' : ''}` }, el('span'));
  const glyph = on ? s.on : (s.hideOff ? '' : s.off);
  return el('span', { class: `tglyph${s.box ? ` box-${s.box}` : ''}${on ? ' on' : ''}${!on && s.fadeOff ? ' faded' : ''}${!on && s.hideOff ? ' ghost' : ''}` }, glyph);
}

/**
 * One field's editor. `commit(value)` saves and resolves to true on success.
 * options: { readOnly, compact, fit, ctx (field context), cardId, showCard }
 */
export function editorFor(field, value, commit, options = {}) {
  const { readOnly = false, compact = false, fit = () => {}, ctx = emptyContext(), showCard = null } = options;
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
  const members = ctx.members && ctx.members.length ? ctx.members : (readOnly ? [SAMPLE_MEMBER] : []);

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
        const on = !!cur;
        wrap.append(el('button', { type: 'button', class: 'toggle', role: 'switch', 'aria-checked': String(on), 'aria-label': field.name, disabled: readOnly, title: on ? 'On' : 'Off',
          onclick: () => save(!on) }, toggleFace(field.style, on), compact ? null : el('span', { class: 'muted toggle-text' }, on ? 'Yes' : 'No')));
        break;
      }
      case 'rating': {
        const s = RATING_STYLES[field.style] || RATING_STYLES.classicStars;
        const max = field.max || 5;
        const n = Number(cur) || 0;
        const row = el('div', { class: `stars${s.emoji ? ' emoji' : ''}`, role: 'group', 'aria-label': field.name, style: s.color ? `--on:${s.color}` : null });
        for (let i = 1; i <= max; i += 1) {
          row.append(el('button', { type: 'button', class: i <= n ? 'on' : '', disabled: readOnly, 'aria-label': `${i} of ${max}`, title: i === n ? 'Click again to clear' : `${i} of ${max}`,
            onclick: () => save(i === n ? null : i) }, i <= n ? s.on : s.off));
        }
        wrap.append(row);
        break;
      }
      case 'progress': {
        const v = Number(cur) || 0;
        const range = el('input', { type: 'range', min: '0', max: '100', step: '5', value: String(v), disabled: readOnly, 'aria-label': field.name });
        const view = el('span', {}, progressView(field, v));
        range.oninput = () => { clear(view); view.append(progressView(field, Number(range.value))); };
        range.onchange = () => save(Number(range.value) || null);
        wrap.append(el('div', { class: 'progress-edit' }, view, readOnly && compact ? null : range));
        break;
      }
      case 'date': {
        const kind = dateKind(field);
        const type = kind === 'time' ? 'time' : kind === 'datetime' ? 'datetime-local' : field.format === 'monthYearShort' ? 'month' : field.format === 'yearOnly' ? 'number' : 'date';
        const inp = el('input', { type, value: dateInputValue(field, cur), disabled: readOnly, 'aria-label': field.name, min: type === 'number' ? '1900' : null, max: type === 'number' ? '2200' : null, placeholder: type === 'number' ? 'Year' : null });
        if (type === 'date' || type === 'datetime-local' || type === 'month') {
          bindDateCommit(inp, (v) => save(dateFromInput(field, v)));
        } else {
          inp.onchange = () => save(dateFromInput(field, inp.value));
          inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); };
        }
        const row = el('div', { class: 'row nowrap' }, el('div', { class: 'grow' }, inp));
        const day = dayOf(field, cur);
        if (cur) row.append(el('small', { class: 'muted date-shown' }, formatValue(field, cur)));
        if (day && field.deadline !== false) {
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const [y, m, d] = day.split('-').map(Number);
          const days = Math.round((new Date(y, m - 1, d) - today) / 86400000);
          row.append(el('span', { class: `pill ${dateColor(field, day, deadlineColor)}` }, days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? 'today' : `in ${days}d`));
        }
        wrap.append(row);
        break;
      }
      case 'number': {
        const inp = input('number', { step: 'any' });
        inp.onchange = () => save(inp.value === '' ? null : Number(inp.value));
        const { format } = numberFormatOf(field);
        const color = scaleColor(field, cur);
        wrap.append(el('div', { class: 'affix row nowrap' }, el('div', { class: 'grow' }, inp),
          typeof cur === 'number' && (format !== 'standard' || color) ? el('span', { class: color ? `pill ${color}` : 'muted num-shown' }, formatNumberValue(field, cur)) : null));
        break;
      }
      case 'duration': {
        const inp = el('input', { type: 'text', value: cur ? formatDuration(field, cur) : '', placeholder: field.placeholder || 'e.g. 1:30 or 1h 30m', disabled: readOnly, 'aria-label': field.name });
        inp.onchange = () => {
          if (!inp.value.trim()) return save(null);
          const minutes = parseDuration(inp.value);
          if (minutes === null) { inp.setCustomValidity('Use 1:30, 1h 30m, 90m or 1.5h'); inp.reportValidity(); return null; }
          inp.setCustomValidity('');
          return save(minutes || null);
        };
        inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); };
        wrap.append(inp);
        break;
      }
      case 'member': {
        const picked = Array.isArray(cur) ? cur : [];
        const row = el('div', { class: 'chips members', role: 'group', 'aria-label': field.name });
        const pool = members.length ? members : picked.map((id) => ({ id, fullName: 'Former member' }));
        for (const m of pool) {
          const on = picked.includes(m.id);
          if (readOnly && !on) continue;
          row.append(el('button', { type: 'button', class: `chip member${on ? ' on blue' : ''}`, 'aria-pressed': String(on), disabled: readOnly,
            onclick: () => {
              const next = on ? picked.filter((x) => x !== m.id) : field.multiple ? [...picked, m.id] : [m.id];
              save(next.length ? next : null);
            } }, avatar(m), m.fullName || m.username));
        }
        if (!row.childNodes.length) row.append(el('span', { class: 'muted' }, readOnly ? '—' : 'No board members found'));
        wrap.append(row);
        break;
      }
      case 'cardref': {
        const picked = Array.isArray(cur) ? cur : [];
        const list = el('div', { class: 'chips' });
        for (const id of picked) {
          const c = ctx.cards.get(id) || (id === SAMPLE_CARD.id ? SAMPLE_CARD : null);
          list.append(el('span', { class: 'cardref' },
            el('button', { type: 'button', class: 'linklike', disabled: !showCard, title: 'Open card', onclick: () => showCard && showCard(id) }, '↗ ', c ? c.name : 'Card not on this board'),
            readOnly ? null : el('button', { type: 'button', class: 'icon', 'aria-label': 'Remove link', onclick: () => { const next = picked.filter((x) => x !== id); save(next.length ? next : null); } }, '×')));
        }
        wrap.append(list);
        if (!readOnly && (field.multiple || !picked.length)) {
          const results = el('div', { class: 'cardref-results' });
          const search = el('input', { type: 'search', placeholder: 'Link a card: type to search…', 'aria-label': `Link a card to ${field.name}` });
          search.oninput = () => {
            clear(results);
            const q = search.value.trim().toLowerCase();
            if (!q) return fit();
            const self = options.cardId;
            [...ctx.cards.values()].filter((c) => c.id !== self && !picked.includes(c.id) && c.name.toLowerCase().includes(q)).slice(0, 8)
              .forEach((c) => results.append(el('button', { type: 'button', class: 'result', onclick: () => save([...picked, c.id]) }, c.name)));
            if (!results.childNodes.length) results.append(el('small', { class: 'muted' }, 'No matching cards'));
            fit();
          };
          wrap.append(search, results);
        }
        if (readOnly && !picked.length) wrap.append(el('span', { class: 'muted' }, '—'));
        break;
      }
      case 'checklist':
      case 'cardid':
      case 'carddate':
        wrap.append(valueView(field, cur, { ctx }));
        if (!compact && field.type === 'checklist' && isEmpty(cur)) wrap.append(el('small', { class: 'muted' }, field.checklist ? ` No checklist named "${field.checklist}" on this card` : ' No checklist items on this card'));
        break;
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

function progressView(field, v) {
  const color = scaleColor(field, v);
  if (!field.style || field.style === 'bar') {
    return el('span', { class: 'row nowrap' }, el('span', { class: `progress${color ? ` c-${color}` : ''}` }, el('span', { style: `width:${v}%` })), el('small', { class: color ? `pill ${color}` : 'muted' }, `${v}%`));
  }
  return el('span', { class: 'row nowrap' }, el('span', { class: 'bar-text' }, progressBar(field, v)), el('small', { class: color ? `pill ${color}` : 'muted' }, `${v}%`));
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

const canBeMissing = (f) => !!f.required && f.type !== 'checkbox' && !isComputed(f);

function fieldCell(field, value, onCommit, options) {
  const empty = isEmpty(value);
  const cell = el('div', { class: `fcell w-${field.width || 'full'}${field.label === 'left' ? ' label-left' : ''}${field.color ? ` bg-${field.color}` : ''}${canBeMissing(field) && empty ? ' missing' : ''}`, 'data-field': field.id });
  const label = el('div', { class: 'flabel' }, el('span', {}, field.name), field.required ? el('span', { class: 'req', title: 'Required' }, ' *') : null);
  const body = el('div', { class: 'fbody' });
  const commit = async (next) => {
    const ok = await onCommit(field, next);
    if (ok !== false) cell.classList.toggle('missing', canBeMissing(field) && isEmpty(next));
    return ok;
  };
  body.append(editorFor(field, value, commit, options));
  if (field.help) body.append(el('small', { class: 'muted help' }, field.help));
  cell.append(label, body);
  return cell;
}

/**
 * The card form. `values` should include computed values (valuesWithComputed).
 * options: { visible, readOnly, fit, state, ctx, cardId, showCard } where `state.section`
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
        const count = g.items.filter((f) => shown.has(f.id) && !isComputed(f) && !isEmpty(values[f.id])).length;
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

/** Small read-only rendering of a value for table cells, previews and computed fields. */
export function valueView(field, value, { ctx = null } = {}) {
  if (isEmpty(value) && field.type !== 'checkbox') return el('span', { class: 'muted' }, '—');
  switch (field.type) {
    case 'choice': { const o = optionOf(field, value); return o ? el('span', { class: `pill ${o.color}` }, o.label) : el('span', { class: 'muted' }, '—'); }
    case 'multi': return el('span', { class: 'chips' }, (value || []).map((v) => optionOf(field, v)).filter(Boolean).map((o) => el('span', { class: `pill ${o.color}` }, o.label)));
    case 'checkbox': return el('span', { class: 'toggle static' }, toggleFace(field.style, !!value));
    case 'rating': {
      const s = RATING_STYLES[field.style] || RATING_STYLES.classicStars;
      return el('span', { class: `stars-view${s.emoji ? ' emoji' : ''}`, style: s.color ? `color:${s.color}` : null }, formatValue(field, value, { short: true }));
    }
    case 'progress': return progressView(field, Number(value) || 0);
    case 'checklist': {
      const pct = value.total ? Math.round((value.done / value.total) * 100) : 0;
      return el('span', { class: 'row nowrap' }, el('span', { class: 'bar-text' }, progressBar(field, pct)), el('small', { class: value.done >= value.total ? 'pill green' : 'muted' }, `${value.done}/${value.total} · ${pct}%`));
    }
    case 'date': {
      const day = dayOf(field, value);
      return el('span', { class: field.deadline !== false && day ? `pill ${dateColor(field, day, deadlineColor)}` : '' }, formatValue(field, value));
    }
    case 'carddate': return el('span', {}, formatValue(field, value));
    case 'cardid': return el('span', { class: 'cardid' }, String(value));
    case 'number': { const c = scaleColor(field, value); return el('span', { class: c ? `pill ${c}` : '' }, formatValue(field, value)); }
    case 'member': return el('span', { class: 'chips' }, (Array.isArray(value) ? value : []).map((id) => {
      const m = ((ctx && ctx.members) || []).find((x) => x.id === id) || (id === SAMPLE_MEMBER.id ? SAMPLE_MEMBER : { id, fullName: 'Former member' });
      return el('span', { class: 'member-tag' }, avatar(m), m.fullName || m.username);
    }));
    case 'cardref': return el('span', {}, formatValue(field, value, { ctx }));
    case 'url': return el('a', { href: value, target: '_blank', rel: 'noopener noreferrer', onclick: (e) => e.stopPropagation() }, formatValue(field, value, { short: true }));
    case 'email': return el('a', { href: `mailto:${value}`, onclick: (e) => e.stopPropagation() }, value);
    case 'notes': return el('span', { title: String(value) }, formatValue(field, value, { short: true }));
    default: return el('span', {}, formatValue(field, value, { ctx }));
  }
}

export function typeIcon(type) {
  return el('span', { class: `ticon t-${type}`, 'aria-hidden': 'true' }, (TYPES[type] || TYPES.text).icon);
}

export { isLayout, DATE_FORMATS };
