// Card-back tab: switch Power-Up features on or off for this card.
import { FEATURES, cardFeatures, setCardFeatures } from '../lib/features.js';
import { el, setStatus } from '../lib/util.js';

export default {
  id: 'features',
  label: '⚙ Features',
  always: true,
  async render(t, root, ctx) {
    const { enabled, custom, defaults } = await cardFeatures(t);
    const state = { ...enabled };

    root.append(el('p', { class: 'muted' }, custom
      ? 'This card has its own feature settings.'
      : 'This card follows the board defaults (Power-Up settings → Default features for cards).'));

    const list = el('div');
    for (const f of FEATURES) {
      const cb = el('input', { type: 'checkbox', checked: !!state[f.id] });
      cb.onchange = async () => {
        state[f.id] = cb.checked;
        await setCardFeatures(t, 'card', state);
        setStatus(`${f.label} ${cb.checked ? 'enabled' : 'disabled'} on this card`, 'success');
        ctx.refresh();
      };
      list.append(el('label', { class: 'row', style: 'text-transform:none;font-weight:400;margin:4px 0' }, cb,
        el('span', { class: 'grow' }, el('strong', {}, f.label), ' ', el('small', { class: 'muted' }, f.desc)),
        defaults[f.id] !== state[f.id] ? el('span', { class: 'pill light-gray', title: 'Differs from board default' }, defaults[f.id] ? 'default: on' : 'default: off') : null));
    }
    root.append(list);
    root.append(el('div', { class: 'row', style: 'margin-top:8px' },
      el('button', { class: 'small', onclick: async () => { Object.keys(state).forEach((k) => { state[k] = true; }); await setCardFeatures(t, 'card', state); ctx.refresh(); } }, 'All on'),
      el('button', { class: 'small', onclick: async () => { Object.keys(state).forEach((k) => { state[k] = false; }); await setCardFeatures(t, 'card', state); ctx.refresh(); } }, 'All off'),
      custom ? el('button', { class: 'small', onclick: async () => { await setCardFeatures(t, 'card', null); setStatus('Following board defaults again', 'success'); ctx.refresh(); } }, 'Reset to board defaults') : null));
    root.append(el('p', { class: 'muted' }, el('small', {}, 'Turning a feature off hides its badges, buttons and tab on this card; its data is kept and comes back when you turn it on again. Use the "Bulk actions" board button to change many cards at once.')));
  }
};
