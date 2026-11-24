import { KEYS, STORAGE_LIMIT, CH_PROXY_URL } from '../config.js';
import { initIframe, fit } from '../lib/iframe.js';
import { set, getSettings, getAllShared } from '../lib/storage.js';
import { FEATURES, boardDefaults } from '../lib/features.js';
import { DEADLINE_BADGES, shownBadges } from '../lib/deadline-badges.js';
import { isAuthorized, isConfigured } from '../lib/trello-api.js';
import { openAuthorize } from '../features/settings.js';
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
      el('button', { class: authed ? 'small' : 'primary small', onclick: () => openAuthorize(t) }, authed ? 'Authorise again' : 'Authorise')));
  }

  app.append(el('h3', {}, 'Companies House'));
  const proxy = el('input', { type: 'url', placeholder: CH_PROXY_URL || 'https://your-worker.workers.dev', value: settings.chProxyUrl || '' });
  app.append(el('label', {}, 'Proxy URL (Cloudflare Worker from /worker — README step 6)'), proxy);
  if (CH_PROXY_URL) app.append(el('p', { class: 'muted' }, el('small', {}, 'Leave empty to use Keel\'s own proxy. Only fill this in to use a different worker on this board.')));

  app.append(el('h3', { style: 'margin-top:10px' }, 'Default features for cards'));
  app.append(el('p', { class: 'muted' }, el('small', {}, 'Cards that have not been customised follow these defaults. Change one card from its ⚙ Features tab, or many cards from Bulk actions.')));
  const defaults = await boardDefaults(t);
  const featureBoxes = {};
  for (const f of FEATURES) {
    featureBoxes[f.id] = el('input', { type: 'checkbox', checked: !!defaults[f.id] });
    app.append(el('label', { class: 'row', style: 'text-transform:none;font-weight:400;margin:3px 0' }, featureBoxes[f.id], el('span', {}, f.label, ' ', el('small', { class: 'muted' }, f.desc))));
  }

  app.append(el('h3', { style: 'margin-top:10px' }, 'Card-front deadlines'));
  app.append(el('p', { class: 'muted' }, el('small', {}, 'Choose which deadlines appear as badges on the front of cards on this board. Badges for your own fields are chosen per field in Fields → Add / edit fields.')));
  const shown = shownBadges(settings);
  const badgeBoxes = {};
  for (const group of [...new Set(DEADLINE_BADGES.map((b) => b.group))]) {
    app.append(el('div', { class: 'muted', style: 'font-size:12px;font-weight:600;margin-top:6px' }, group));
    for (const b of DEADLINE_BADGES.filter((x) => x.group === group)) {
      badgeBoxes[b.id] = el('input', { type: 'checkbox', checked: shown[b.id] });
      app.append(el('label', { class: 'row', style: 'text-transform:none;font-weight:400;margin:3px 0' }, badgeBoxes[b.id], el('span', {}, b.label)));
    }
  }

  const used = jsonSize(boardData);
  app.append(el('p', { class: 'muted' }, el('small', {}, `Board storage used: ${used} / ${STORAGE_LIMIT} characters (routines, audit log, settings).`)));

  app.append(el('p', {}, el('button', { class: 'primary', onclick: async () => {
    const nextDefaults = Object.fromEntries(FEATURES.map((f) => [f.id, featureBoxes[f.id].checked]));
    const cardBadges = Object.fromEntries(DEADLINE_BADGES.map((b) => [b.id, badgeBoxes[b.id].checked]));
    // Keep any other settings keys; replace the ones edited here.
    const { stageBadges, ...rest } = settings;
    await set(t, 'board', KEYS.settings, { ...rest, chProxyUrl: proxy.value.trim().replace(/\/+$/, ''), cardBadges, defaults: nextDefaults });
    setStatus('Saved', 'success');
  } }, 'Save settings')));
  fit(t);
}
t.render(render);
