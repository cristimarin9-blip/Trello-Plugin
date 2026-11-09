import { KEYS, STORAGE_LIMIT } from '../config.js';
import { initIframe, fit } from '../lib/iframe.js';
import { get, set, getSettings, getAllShared } from '../lib/storage.js';
import { authorize, clearToken, isAuthorized, hasAppKey } from '../lib/trello-api.js';
import { byId, clear, el, jsonSize, setStatus } from '../lib/util.js';

const t = initIframe();
const app = byId('app');

async function render() {
  clear(app);
  const [settings, authed, boardData] = await Promise.all([getSettings(t), isAuthorized(t), getAllShared(t, 'board')]);

  app.append(el('h3', {}, 'Trello access'));
  if (!hasAppKey()) {
    app.append(el('p', { class: 'notice' }, 'APP_KEY is not set in public/js/config.js (README step 3). Until then, features that use the Trello REST API are disabled.'));
  } else {
    app.append(el('p', { class: 'row between' },
      el('span', {}, authed ? '✅ Authorised' : '⚠️ Not authorised'),
      authed
        ? el('button', { class: 'small', onclick: async () => { await clearToken(t); render(); } }, 'Revoke')
        : el('button', { class: 'primary small', onclick: async () => { try { await authorize(t); render(); } catch (err) { setStatus(err.message || 'Cancelled', 'error'); } } }, 'Authorise')));
  }

  app.append(el('h3', {}, 'Companies House'));
  const proxy = el('input', { type: 'url', placeholder: 'https://your-worker.workers.dev', value: settings.chProxyUrl || '' });
  app.append(el('label', {}, 'Proxy URL (Cloudflare Worker from /worker — README step 6)'), proxy);

  app.append(el('h3', { style: 'margin-top:10px' }, 'Behaviour'));
  const stageBadges = el('input', { type: 'checkbox', checked: settings.stageBadges });
  const recordViews = el('input', { type: 'checkbox', checked: settings.recordViews });
  app.append(
    el('label', { class: 'row', style: 'text-transform:none' }, stageBadges, ' Show client stage badges on card fronts'),
    el('label', { class: 'row', style: 'text-transform:none' }, recordViews, ' Record who viewed each card')
  );

  const used = jsonSize(boardData);
  app.append(el('p', { class: 'muted' }, el('small', {}, `Board storage used: ${used} / ${STORAGE_LIMIT} characters (routines, audit log, settings).`)));

  app.append(el('p', {}, el('button', { class: 'primary', onclick: async () => {
    await set(t, 'board', KEYS.settings, { chProxyUrl: proxy.value.trim().replace(/\/+$/, ''), stageBadges: stageBadges.checked, recordViews: recordViews.checked });
    setStatus('Saved', 'success');
  } }, 'Save settings')));
  fit(t);
}
t.render(render);
