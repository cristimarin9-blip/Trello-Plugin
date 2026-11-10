import { KEYS, STORAGE_LIMIT } from '../config.js';
import { initIframe, fit } from '../lib/iframe.js';
import { set, getSettings, getAllShared } from '../lib/storage.js';
import { FEATURES, boardDefaults } from '../lib/features.js';
import { authorize, isAuthorized, isConfigured } from '../lib/trello-api.js';
import { byId, clear, el, jsonSize, setStatus } from '../lib/util.js';

const t = initIframe();
const app = byId('app');

async function render() {
  clear(app);
  const [settings, authed, boardData] = await Promise.all([getSettings(t), isAuthorized(t), getAllShared(t, 'board')]);

  app.append(el('h3', {}, 'Trello access'));
  if (!isConfigured()) {
    app.append(el('p', { class: 'notice' }, 'OAUTH_CLIENT_ID is not set in public/js/config.js (README step 3). Until then, features that use the Trello REST API are disabled.'));
  } else {
    app.append(el('p', { class: 'row between' },
      el('span', {}, authed ? '✅ Authorised for this workspace' : '⚠️ Not authorised'),
      el('button', { class: authed ? 'small' : 'primary small', onclick: async () => { try { await authorize(t); render(); } catch (err) { setStatus(err.message || 'Cancelled', 'error'); } } }, authed ? 'Authorise again' : 'Authorise')));
  }

  app.append(el('h3', {}, 'Companies House'));
  const proxy = el('input', { type: 'url', placeholder: 'https://your-worker.workers.dev', value: settings.chProxyUrl || '' });
  app.append(el('label', {}, 'Proxy URL (Cloudflare Worker from /worker — README step 6)'), proxy);

  app.append(el('h3', { style: 'margin-top:10px' }, 'Default features for cards'));
  app.append(el('p', { class: 'muted' }, el('small', {}, 'Cards that have not been customised follow these defaults. Change one card from its ⚙ Features tab, or many cards from Bulk actions.')));
  const defaults = await boardDefaults(t);
  const featureBoxes = {};
  for (const f of FEATURES) {
    featureBoxes[f.id] = el('input', { type: 'checkbox', checked: !!defaults[f.id] });
    app.append(el('label', { class: 'row', style: 'text-transform:none;font-weight:400;margin:3px 0' }, featureBoxes[f.id], el('span', {}, f.label, ' ', el('small', { class: 'muted' }, f.desc))));
  }

  app.append(el('h3', { style: 'margin-top:10px' }, 'Display'));
  const stageBadges = el('input', { type: 'checkbox', checked: settings.stageBadges });
  app.append(el('label', { class: 'row', style: 'text-transform:none' }, stageBadges, ' Show client stage badges on card fronts'));

  const used = jsonSize(boardData);
  app.append(el('p', { class: 'muted' }, el('small', {}, `Board storage used: ${used} / ${STORAGE_LIMIT} characters (routines, audit log, settings).`)));

  app.append(el('p', {}, el('button', { class: 'primary', onclick: async () => {
    const nextDefaults = Object.fromEntries(FEATURES.map((f) => [f.id, featureBoxes[f.id].checked]));
    await set(t, 'board', KEYS.settings, { chProxyUrl: proxy.value.trim().replace(/\/+$/, ''), stageBadges: stageBadges.checked, defaults: nextDefaults });
    setStatus('Saved', 'success');
  } }, 'Save settings')));
  fit(t);
}
t.render(render);
