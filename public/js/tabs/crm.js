// Card-back tab: client stage tracker (bookkeeping / accounts / VAT / PAYE).
import { KEYS } from '../config.js';
import { get, set } from '../lib/storage.js';
import { TRACKS, TRACK_ORDER, stageColor, periodFromTitle, periodOf, today } from '../features/crm.js';
import { el, formatDate, daysUntil, toDateInput, setStatus, bindDateCommit } from '../lib/util.js';

export default {
  id: 'crm',
  label: 'Client stages',
  async render(t, root, ctx) {
    const [crm, company, card] = await Promise.all([get(t, 'card', KEYS.crm, {}), get(t, 'card', KEYS.company), t.card('id', 'name')]);
    const titlePeriod = periodFromTitle(card.name);
    const state = { ...(crm || {}) };
    let timer;
    // Notes save after a pause in typing; everything that redraws the tab saves first.
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await set(t, 'card', KEYS.crm, state);
        setStatus('Saved', 'success');
      }, 400);
    };
    const saveAndRefresh = async () => {
      clearTimeout(timer);
      await set(t, 'card', KEYS.crm, state);
      setStatus('Saved', 'success');
      ctx.refresh();
    };

    // Which tracks are collapsed is remembered per person (this browser) and card.
    const COLLAPSE_KEY = 'keel:crm-collapsed';
    const readCollapsed = () => { try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}'); } catch { return {}; } };
    const collapsed = new Set(readCollapsed()[card.id] || []);
    const writeCollapsed = () => {
      try {
        const all = readCollapsed();
        if (collapsed.size) all[card.id] = [...collapsed]; else delete all[card.id];
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(all));
      } catch { /* private mode */ }
    };

    for (const key of TRACK_ORDER) state[key] = state[key] || { on: false, stage: TRACKS[key].stages[0], note: '' };

    // Choose the tracks that apply: e.g. leave VAT off for a client that is not VAT registered.
    const picker = el('div', { class: 'track-picker', role: 'group', 'aria-label': 'Tracks for this client' }, el('span', { class: 'muted' }, 'Tracks:'));
    for (const key of TRACK_ORDER) {
      const track = state[key];
      picker.append(el('button', { class: `chip${track.on ? ' on blue' : ''}`, 'aria-pressed': String(!!track.on), title: track.on ? `Stop tracking ${TRACKS[key].label} for this client` : `Track ${TRACKS[key].label} for this client`,
        onclick: () => { track.on = !track.on; if (track.on && !track.changed) track.changed = today(); if (track.on) collapsed.delete(key); writeCollapsed(); saveAndRefresh(); } },
      track.on ? '✓ ' : '+ ', TRACKS[key].label));
    }
    const onKeys = TRACK_ORDER.filter((k) => state[k].on);
    if (onKeys.length > 1) {
      const allCollapsed = onKeys.every((k) => collapsed.has(k));
      picker.append(el('span', { class: 'grow' }), el('button', { class: 'small', onclick: () => {
        if (allCollapsed) collapsed.clear(); else onKeys.forEach((k) => collapsed.add(k));
        writeCollapsed(); ctx.refresh();
      } }, allCollapsed ? '▾ Expand all' : '▸ Collapse all'));
    }
    root.append(picker);
    if (!onKeys.length) {
      root.append(el('p', { class: 'muted' }, 'Pick the tracks that apply to this client above. Leave out VAT if the client is not VAT registered, and PAYE if they have no payroll.'));
    }

    for (const key of onKeys) {
      const def = TRACKS[key];
      const track = state[key];
      // Moving to another stage records the date; it can be corrected by hand.
      const setStage = (stage) => { if (stage !== track.stage) { track.stage = stage; track.changed = today(); } saveAndRefresh(); };
      const isCollapsed = collapsed.has(key);
      const color = stageColor(key, track, company, card.name);
      const period = periodOf(track, card.name);
      const due = def.deadline(period, company);
      const days = daysUntil(due);
      const box = el('div', { class: `track${isCollapsed ? ' collapsed' : ''}` });
      const header = el('header', {},
        el('button', { class: 'track-toggle', 'aria-expanded': String(!isCollapsed), title: isCollapsed ? 'Show details' : 'Hide details',
          onclick: () => { if (isCollapsed) collapsed.delete(key); else collapsed.add(key); writeCollapsed(); ctx.refresh(); } },
        el('span', { class: 'caret', 'aria-hidden': 'true' }, isCollapsed ? '▸' : '▾'), def.label),
        el('span', { class: 'row', style: 'gap:6px' },
          isCollapsed && due ? el('small', { class: 'muted' }, days < 0 ? `${-days}d overdue` : `due ${formatDate(due, { year: undefined })}`) : null,
          el('span', { class: `pill ${color || 'light-gray'}` }, track.stage)));
      box.append(header);
      if (!isCollapsed) {
        const stageSelect = el('select', { 'aria-label': `${def.label} stage`, onchange: () => setStage(stageSelect.value) },
          def.stages.map((st) => el('option', { value: st, selected: st === track.stage }, st)));
        const changed = el('input', { type: 'date', value: toDateInput(track.changed), 'aria-label': `${def.label} stage changed` });
        // 2020 or later; saving waits until the four-digit year is typed.
        bindDateCommit(changed, (v) => { track.changed = v || null; saveAndRefresh(); }, { minYear: 2020 });
        const note = el('input', { type: 'text', maxlength: '80', placeholder: 'Short note (optional)', value: track.note || '', onchange: () => { track.note = note.value; save(); } });
        const idx = def.stages.indexOf(track.stage);
        const next = el('button', { class: 'small', disabled: idx >= def.stages.length - 1, onclick: () => setStage(def.stages[idx + 1]) }, 'Next stage →');
        box.append(
          el('div', { class: 'grid-2' },
            el('div', {}, el('label', {}, 'Stage'), stageSelect),
            el('div', {}, el('label', {}, 'Stage changed'), changed)),
          el('div', { class: 'muted', style: 'font-size:12px;margin-top:6px' },
            titlePeriod ? `Period end (from the card title): ${formatDate(titlePeriod)}`
              : period ? `Period end: ${formatDate(period)} (saved earlier; put it in the card title, e.g. "YE31.08.26", to keep it with the card)`
                : 'No period end in the card title. Add it like "YE31.08.26" or "QE 30/06/2026" to get deadlines.'),
          el('div', { class: 'row between', style: 'margin-top:6px' },
            el('small', { class: 'muted' }, due ? `${def.deadlineLabel}: ${formatDate(due)} (${days < 0 ? `${-days}d overdue` : `${days}d left`})` : def.deadlineLabel),
            next),
          el('div', {}, note)
        );
      }
      root.append(box);
    }
    root.append(el('p', { class: 'muted' }, el('small', {}, 'The period end is read from the card title. Active tracks show as badges on the card front. Use the "Client CRM" board button to see every client at once.')));
  }
};
