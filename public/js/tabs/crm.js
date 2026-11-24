// Card-back tab: client stage tracker (bookkeeping / accounts / VAT / PAYE).
import { KEYS } from '../config.js';
import { get, set } from '../lib/storage.js';
import { TRACKS, TRACK_ORDER, stageColor, periodFromTitle, periodOf, today } from '../features/crm.js';
import { el, formatDate, daysUntil, toDateInput, setStatus, bindDateCommit } from '../lib/util.js';

export default {
  id: 'crm',
  label: 'Client stages',
  async render(t, root, ctx) {
    const [crm, company, card] = await Promise.all([get(t, 'card', KEYS.crm, {}), get(t, 'card', KEYS.company), t.card('name')]);
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

    for (const key of TRACK_ORDER) {
      const def = TRACKS[key];
      const track = state[key] || { on: false, stage: def.stages[0], note: '' };
      state[key] = track;
      // Moving to another stage records the date; it can be corrected by hand.
      const setStage = (stage) => { if (stage !== track.stage) { track.stage = stage; track.changed = today(); } saveAndRefresh(); };
      const box = el('div', { class: 'track' });
      const toggle = el('input', { type: 'checkbox', checked: track.on, onchange: () => { track.on = toggle.checked; if (track.on && !track.changed) track.changed = today(); saveAndRefresh(); } });
      const header = el('header', {}, el('label', { class: 'row', style: 'margin:0' }, toggle, ` ${def.label}`));
      box.append(header);
      if (track.on) {
        const color = stageColor(key, track, company, card.name);
        const stageSelect = el('select', { 'aria-label': `${def.label} stage`, onchange: () => setStage(stageSelect.value) },
          def.stages.map((s) => el('option', { value: s, selected: s === track.stage }, s)));
        const changed = el('input', { type: 'date', value: toDateInput(track.changed), 'aria-label': `${def.label} stage changed` });
        // 2020 or later; saving waits until the four-digit year is typed.
        bindDateCommit(changed, (v) => { track.changed = v || null; saveAndRefresh(); }, { minYear: 2020 });
        const note = el('input', { type: 'text', maxlength: '80', placeholder: 'Short note (optional)', value: track.note || '', onchange: () => { track.note = note.value; save(); } });
        const idx = def.stages.indexOf(track.stage);
        const next = el('button', { class: 'small', disabled: idx >= def.stages.length - 1, onclick: () => setStage(def.stages[idx + 1]) }, 'Next stage →');
        header.append(el('span', { class: `pill ${color || 'light-gray'}` }, track.stage));
        const period = periodOf(track, card.name);
        const due = def.deadline(period, company);
        const days = daysUntil(due);
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
