// Card-back tab: this card's custom field values, and which fields it shows.
import { api, visibleFields, isLayout, isComputed, markCardChanged, NeedsAuthError, TYPES, loadContext, valuesWithComputed } from '../lib/fields.js';
import { renderForm, groupFields, typeIcon } from '../lib/field-ui.js';
import { openBoard } from '../features/fields.js';
import { openAuthorize } from '../features/settings.js';
import { el, clear, setStatus } from '../lib/util.js';

function needsAuth(root, t, ctx) {
  root.append(el('p', {}, 'Fields are stored by Keel, so Keel needs your permission first.'),
    el('button', { class: 'primary', onclick: () => openAuthorize(t, () => ctx.refresh()) }, 'Authorise'));
}

// Remembers the open section tab while the card stays open.
const formState = {};

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
    if (!fields.some((f) => !isLayout(f))) {
      root.append(el('p', { class: 'muted' }, 'This board has no fields yet. Add fields such as VAT status, company number or "things to check" notes, then fill them in on each card.'),
        el('button', { class: 'primary', onclick: () => openBoard(t, 'manage') }, 'Set up fields'));
      return;
    }

    const fctx = await loadContext(t, fields, { boardId: data.boardId });
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

    const picker = el('div', { class: 'picker', hidden: true });
    const count = el('small', { class: 'muted' });
    const toolbar = el('div', { class: 'row between ftoolbar' }, count,
      el('div', { class: 'row' },
        el('button', { class: 'small', 'aria-expanded': 'false', onclick: (e) => { picker.hidden = !picker.hidden; e.currentTarget.setAttribute('aria-expanded', String(!picker.hidden)); drawPicker(); ctx.fit(); } }, 'Visible fields'),
        el('button', { class: 'small', onclick: () => openBoard(t, 'manage') }, 'Manage fields')));
    const body = el('div');
    root.append(toolbar, picker, body);

    function drawPicker() {
      clear(picker);
      if (picker.hidden) return;
      const shown = new Set(visibleFields(fields, visible).map((f) => f.id));
      const setVisible = async (next) => {
        if (await save({ visible: next }, { badge: true })) { drawPicker(); drawForm(); ctx.fit(); }
      };
      picker.append(el('div', { class: 'row between' }, el('strong', {}, 'Fields to show on this card'),
        el('span', { class: 'row' },
          el('button', { class: 'small', onclick: () => setVisible(fields.filter((f) => !isLayout(f)).map((f) => f.id)) }, 'All'),
          el('button', { class: 'small', onclick: () => setVisible([]) }, 'None'),
          el('button', { class: 'small', title: 'Show the fields the board shows on new cards', onclick: () => setVisible(null) }, 'Board default'))));
      const list = el('div', { class: 'picker-list' });
      for (const g of groupFields(fields)) {
        const items = g.items.filter((f) => !isLayout(f));
        if (!items.length) continue;
        if (g.section) list.append(el('div', { class: 'picker-group' }, typeIcon('section'), g.section.name));
        for (const f of items) {
          const box = el('input', { type: 'checkbox', checked: shown.has(f.id), onchange: () => {
            const next = fields.filter((x) => !isLayout(x) && (x.id === f.id ? box.checked : shown.has(x.id))).map((x) => x.id);
            setVisible(next);
          } });
          list.append(el('label', { class: `picker-item${box.checked ? ' on' : ''}` }, box, typeIcon(f.type), el('span', {}, f.name), el('small', { class: 'muted' }, TYPES[f.type].label)));
        }
      }
      picker.append(list, el('p', { class: 'muted' }, el('small', {}, Array.isArray(visible) ? 'This card has its own selection.' : 'This card follows the board default.')));
    }

    function drawForm() {
      clear(body);
      const n = visibleFields(fields, visible).length;
      count.textContent = `${n} of ${fields.filter((f) => !isLayout(f)).length} fields shown`;
      const shown = valuesWithComputed(fields, values, cardId, fctx);
      body.append(renderForm(fields, shown, (f, v) => (isComputed(f) ? false : save({ values: { [f.id]: v } }, { badge: !!(f.badge || f.required) })),
        { visible, state: formState, fit: ctx.fit, ctx: fctx, cardId, showCard: (id) => t.showCard(id) }));
      ctx.fit();
    }

    drawForm();
  }
};
