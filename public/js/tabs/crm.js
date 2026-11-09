// Card-back tab: client stage tracker (bookkeeping / accounts / VAT / PAYE).
import { KEYS } from '../config.js';
import { get, set } from '../lib/storage.js';
import { TRACKS, TRACK_ORDER, stageColor } from '../features/crm.js';
import { el, formatDate, daysUntil, toDateInput, setStatus } from '../lib/util.js';

export default {
  id: 'crm',
  label: 'Client stages',
  async render(t, root, ctx) {
    const [crm, company] = await Promise.all([get(t, 'card', KEYS.crm, {}), get(t, 'card', KEYS.company)]);
    const state = { ...(crm || {}) };
    let timer;
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await set(t, 'card', KEYS.crm, state);
        setStatus('Saved', 'success');
      }, 400);
    };

    for (const key of TRACK_ORDER) {
      const def = TRACKS[key];
      const track = state[key] || { on: false, stage: def.stages[0], period: '', note: '' };
      state[key] = track;
      const box = el('div', { class: 'track' });
      const toggle = el('input', { type: 'checkbox', checked: track.on, onchange: () => { track.on = toggle.checked; save(); ctx.refresh(); } });
      const header = el('header', {}, el('label', { class: 'row', style: 'margin:0' }, toggle, ` ${def.label}`));
      box.append(header);
      if (track.on) {
        const color = stageColor(key, track, company);
        const stageSelect = el('select', { onchange: () => { track.stage = stageSelect.value; save(); ctx.refresh(); } },
          def.stages.map((s) => el('option', { value: s, selected: s === track.stage }, s)));
        const period = el('input', { type: 'date', value: toDateInput(track.period), onchange: () => { track.period = period.value; save(); ctx.refresh(); } });
        const note = el('input', { type: 'text', maxlength: '80', placeholder: 'Short note (optional)', value: track.note || '', onchange: () => { track.note = note.value; save(); } });
        const idx = def.stages.indexOf(track.stage);
        const next = el('button', { class: 'small', disabled: idx >= def.stages.length - 1, onclick: () => { track.stage = def.stages[idx + 1]; save(); ctx.refresh(); } }, 'Next stage →');
        header.append(el('span', { class: `pill ${color || 'light-gray'}` }, track.stage));
        const due = def.deadline(track.period, company);
        const days = daysUntil(due);
        box.append(
          el('div', { class: 'grid-2' },
            el('div', {}, el('label', {}, 'Stage'), stageSelect),
            el('div', {}, el('label', {}, 'Period end'), period)),
          el('div', { class: 'row between', style: 'margin-top:6px' },
            el('small', { class: 'muted' }, due ? `${def.deadlineLabel}: ${formatDate(due)} (${days < 0 ? `${-days}d overdue` : `${days}d left`})` : def.deadlineLabel),
            next),
          el('div', {}, note)
        );
      }
      root.append(box);
    }
    root.append(el('p', { class: 'muted' }, el('small', {}, 'Active tracks show as badges on the card front. Use the "Client CRM" board button to see every client at once.')));
  }
};
