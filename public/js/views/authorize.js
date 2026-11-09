import { initIframe, fit } from '../lib/iframe.js';
import { authorize, isAuthorized, clearToken, hasAppKey } from '../lib/trello-api.js';
import { byId, clear, el, setStatus } from '../lib/util.js';

const t = initIframe();
const app = byId('app');

async function render() {
  clear(app);
  if (!hasAppKey()) {
    app.append(el('p', { class: 'notice' }, 'APP_KEY is not set in public/js/config.js. Follow README step 3, redeploy, then come back.'));
    return fit(t);
  }
  const authed = await isAuthorized(t);
  app.append(el('p', {}, authed
    ? 'This Power-Up can act on your behalf (card history, checklists, bulk and scheduled actions).'
    : 'Allow the Power-Up to read and update cards on your behalf. This is needed for card history, checklist tools, routines, bulk and scheduled actions.'));
  app.append(el('p', { class: 'row' },
    authed
      ? el('button', { onclick: async () => { await clearToken(t); render(); } }, 'Revoke access')
      : el('button', { class: 'primary', onclick: async () => {
        try { await authorize(t); setStatus('Authorised', 'success'); t.closePopup(); } catch (err) { setStatus(err.message || 'Authorisation cancelled', 'error'); }
      } }, 'Authorise')));
  fit(t);
}
t.render(render);
