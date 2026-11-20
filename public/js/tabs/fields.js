// Card-back tab: this card's custom field values, and which fields it shows.
import { api, visibleFields, optionOf, renderNotes, markCardChanged, NeedsAuthError, TYPES } from '../lib/fields.js';
import { openBoard } from '../features/fields.js';
import { authorize } from '../lib/trello-api.js';
import { el, clear, toDateInput, daysUntil, deadlineColor, setStatus } from '../lib/util.js';

function needsAuth(root, t, ctx) {
  root.append(el('p', {}, 'Fields are stored by Keel, so Keel needs your permission first.'),
    el('button', { class: 'primary', onclick: async () => {
      try { await authorize(t); ctx.refresh(); } catch (err) { setStatus(err.message || 'Authorisation cancelled', 'error'); }
    } }, 'Authorise'));
}

export default {
  id: 'fields',
  label: 'Fields',
  async render(t, root, ctx) {
    const { id: cardId } = await t.card('id');
    let data;
    try {
      data = await api.card(t, cardId);
    } catch (err) {
      if (err instanceof NeedsAuthError) return needsAuth(root, t, ctx);
      throw err;
    }
    const fields = data.fields || [];
    if (!fields.length) {
      root.append(el('p', { class: 'muted' }, 'This board has no fields yet. Add fields such as VAT status, company number or "things to check" notes, then fill them in on each card.'),
        el('button', { class: 'primary', onclick: () => openBoard(t, 'manage') }, 'Set up fields'));
      return;
    }

    let values = { ...(data.values || {}) };
    let visible = data.visible;

    async function save(patch, { badge = false } = {}) {
      setStatus('Saving…');
      try {
        const res = await api.patchCard(t, cardId, patch);
        values = res.values || {};
        visible = res.visible;
        setStatus('Saved', 'success');
        if (badge) markCardChanged(t);
        return true;
      } catch (err) {
        setStatus(err.message, 'error');
        return false;
      }
    }

    // --- Toolbar: visible-fields picker and manage link ---------------------
    const picker = el('div', { class: 'track', hidden: true });
    const toolbar = el('div', { class: 'row between' },
      el('small', { class: 'muted' }, ''),
      el('div', { class: 'row' },
        el('button', { class: 'small', onclick: () => { picker.hidden = !picker.hidden; drawPicker(); ctx.fit(); } }, 'Visible fields'),
        el('button', { class: 'small', onclick: () => openBoard(t, 'manage') }, 'Manage fields')));
    const body = el('div');
    root.append(toolbar, picker, body);

    function drawPicker() {
      clear(picker);
      if (picker.hidden) return;
      const shown = new Set(visibleFields(fields, visible).map((f) => f.id));
      const setVisible = async (next) => {
        if (await save({ visible: next }, { badge: true })) { drawPicker(); drawFields(); ctx.fit(); }
      };
      picker.append(el('header', {}, el('span', {}, 'Fields to show on this card'),
        el('span', { class: 'row' },
          el('button', { class: 'small', onclick: () => setVisible(fields.map((f) => f.id)) }, 'All'),
          el('button', { class: 'small', onclick: () => setVisible([]) }, 'None'),
          el('button', { class: 'small', title: 'Show the fields the board marks as "show on cards"', onclick: () => setVisible(null) }, 'Board default'))));
      for (const f of fields) {
        const box = el('input', { type: 'checkbox', checked: shown.has(f.id), onchange: () => {
          const next = fields.filter((x) => (x.id === f.id ? box.checked : shown.has(x.id))).map((x) => x.id);
          setVisible(next);
        } });
        picker.append(el('label', { class: 'row', style: 'text-transform:none;font-weight:400;margin:3px 0' }, box, el('span', {}, f.name, ' ', el('small', { class: 'muted' }, TYPES[f.type].label))));
      }
      picker.append(el('p', { class: 'muted' }, el('small', {}, Array.isArray(visible) ? 'This card has its own selection.' : 'This card follows the board default.')));
    }

    function editor(f) {
      const value = values[f.id];
      const commit = (v) => save({ values: { [f.id]: v } }, { badge: f.badge });
      switch (f.type) {
        case 'choice': {
          const group = el('div', { class: 'segmented', role: 'group', 'aria-label': f.name });
          for (const o of f.options || []) {
            const on = value === o.id;
            group.append(el('button', { class: on ? `on ${o.color}` : '', 'aria-pressed': String(on), title: on ? 'Click again to clear' : '',
              onclick: async () => { if (await commit(on ? null : o.id)) drawFields(); } }, o.label));
          }
          if (value && !optionOf(f, value)) group.append(el('small', { class: 'muted' }, ' (option removed)'));
          return group;
        }
        case 'checkbox': {
          const box = el('input', { type: 'checkbox', checked: !!value, 'aria-label': f.name, onchange: () => commit(box.checked) });
          return box;
        }
        case 'date': {
          const input = el('input', { type: 'date', value: toDateInput(value), 'aria-label': f.name, onchange: async () => { if (await commit(input.value || null)) drawFields(); } });
          if (!value) return input;
          const days = daysUntil(value);
          const text = days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? 'today' : `in ${days}d`;
          return el('div', { class: 'row' }, el('div', { class: 'grow' }, input), el('span', { class: `pill ${deadlineColor(value)}` }, text));
        }
        case 'number': {
          const input = el('input', { type: 'number', step: 'any', value: value ?? '', 'aria-label': f.name, onchange: () => commit(input.value === '' ? null : Number(input.value)) });
          return input;
        }
        case 'notes': return notesEditor(f, value, commit);
        default: {
          const input = el('input', { type: 'text', value: value ?? '', 'aria-label': f.name, onchange: () => commit(input.value) });
          input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
          return input;
        }
      }
    }

    function notesEditor(f, value, commit) {
      const wrap = el('div');
      const view = () => {
        clear(wrap);
        const shown = value ? renderNotes(value) : el('p', { class: 'muted' }, 'No notes yet.');
        shown.classList.add('notes-view');
        shown.title = 'Click to edit';
        shown.tabIndex = 0;
        shown.onclick = edit;
        shown.onkeydown = (e) => { if (e.key === 'Enter') edit(); };
        wrap.append(shown);
        ctx.fit();
      };
      const edit = () => {
        clear(wrap);
        const area = el('textarea', { rows: String(Math.min(16, Math.max(5, String(value || '').split('\n').length + 1))), 'aria-label': f.name,
          placeholder: 'Heading:\n- first point\n- second point' }, value || '');
        area.value = value || '';
        const done = async () => {
          const next = area.value;
          if (next === (value || '')) return view();
          if (await commit(next)) { value = values[f.id]; view(); }
        };
        area.onkeydown = (e) => { if (e.key === 'Escape') view(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) done(); };
        wrap.append(area, el('div', { class: 'row', style: 'margin-top:4px' },
          el('button', { class: 'primary small', onclick: done }, 'Save'),
          el('button', { class: 'small', onclick: view }, 'Cancel'),
          el('small', { class: 'muted' }, 'Lines starting with "- " become bullets · Ctrl+Enter saves')));
        ctx.fit();
        area.focus();
      };
      view();
      return wrap;
    }

    function drawFields() {
      clear(body);
      const list = visibleFields(fields, visible);
      toolbar.firstChild.textContent = `${list.length} of ${fields.length} fields shown`;
      if (!list.length) {
        body.append(el('p', { class: 'muted' }, 'No fields are shown on this card. Use "Visible fields" to pick some.'));
        return ctx.fit();
      }
      for (const f of list) {
        body.append(el('div', { class: 'field' }, el('label', {}, f.name), editor(f)));
      }
      ctx.fit();
    }

    drawFields();
  }
};
