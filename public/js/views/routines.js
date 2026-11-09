// Modal: manage processes & routines (step lists applied to cards as checklists).
import { KEYS, STORAGE_LIMIT } from '../config.js';
import { initIframe } from '../lib/iframe.js';
import { get, set, projectedUsage } from '../lib/storage.js';
import { byId, clear, el, uid, setStatus } from '../lib/util.js';

const t = initIframe();
const app = byId('app');
let editing = null;

async function render() {
  clear(app);
  const routines = (await get(t, 'board', KEYS.routines)) || [];
  const left = el('div', { style: 'flex:1 1 260px' });
  const right = el('div', { style: 'flex:2 1 360px' });
  app.append(el('div', { class: 'row', style: 'align-items:flex-start' }, left, right));

  left.append(el('h3', {}, 'Routines'), el('ul', { class: 'card-list' }, routines.map((r) => el('li', { onclick: () => { editing = { ...r }; render(); } },
    el('span', { class: 'grow' }, r.name), el('small', {}, `${r.steps.length} steps`)))));
  left.append(el('p', {}, el('button', { class: 'primary', onclick: () => { editing = { id: uid(), name: '', steps: [] }; render(); } }, '+ New routine')));
  left.append(el('p', { class: 'muted' }, el('small', {}, 'Apply a routine from a card: card menu → "Apply routine". It becomes a checklist; "↳ " prefixes make sub-points.')));

  if (!editing) {
    right.append(el('p', { class: 'muted' }, 'Select a routine to edit, or create a new one. Examples: "New client onboarding", "Monthly bookkeeping", "VAT quarter", "Year-end accounts".'));
    return;
  }
  const name = el('input', { type: 'text', value: editing.name, placeholder: 'Routine name, e.g. Monthly bookkeeping' });
  const steps = el('textarea', { placeholder: 'One step per line\n↳ Indent a sub-point with "↳ "', style: 'min-height:220px' });
  steps.value = editing.steps.join('\n');
  const usage = el('small', { class: 'muted' });
  const updateUsage = async () => {
    const draft = routines.filter((r) => r.id !== editing.id).concat([{ id: editing.id, name: name.value, steps: steps.value.split('\n').map((s) => s.trim()).filter(Boolean) }]);
    const { size } = await projectedUsage(t, 'board', KEYS.routines, draft);
    usage.textContent = `Board storage after save: ${size} / ${STORAGE_LIMIT} characters`;
    usage.className = size > STORAGE_LIMIT ? 'status error' : 'muted';
  };
  steps.oninput = updateUsage; name.oninput = updateUsage; updateUsage();
  right.append(el('label', {}, 'Name'), name, el('label', {}, 'Steps'), steps, el('p', {}, usage),
    el('div', { class: 'row' },
      el('button', { class: 'primary', onclick: async () => {
        const next = { id: editing.id, name: name.value.trim(), steps: steps.value.split('\n').map((s) => s.trim()).filter(Boolean) };
        if (!next.name || !next.steps.length) return setStatus('Name and at least one step are required', 'error');
        const draft = routines.filter((r) => r.id !== editing.id).concat([next]);
        const { size } = await projectedUsage(t, 'board', KEYS.routines, draft);
        if (size > STORAGE_LIMIT) return setStatus('Too much routine text for Trello\'s 4 KB board storage. Shorten steps or delete an old routine.', 'error');
        await set(t, 'board', KEYS.routines, draft);
        editing = null; setStatus('Saved', 'success'); render();
      } }, 'Save'),
      el('button', { onclick: () => { editing = null; render(); } }, 'Cancel'),
      routines.some((r) => r.id === editing.id) ? el('button', { class: 'danger', onclick: async () => {
        if (!window.confirm(`Delete routine "${editing.name}"?`)) return;
        await set(t, 'board', KEYS.routines, routines.filter((r) => r.id !== editing.id));
        editing = null; render();
      } }, 'Delete') : null));
}
t.render(render);
