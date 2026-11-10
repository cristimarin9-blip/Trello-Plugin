import { initIframe, fit } from '../lib/iframe.js';
import { authorize, isAuthorized, isConfigured } from '../lib/trello-api.js';
import { byId, clear, el, setStatus } from '../lib/util.js';

const t = initIframe();
const app = byId('app');

async function render() {
  clear(app);
  if (!isConfigured()) {
    app.append(el('p', { class: 'notice' }, 'OAUTH_CLIENT_ID is not set in public/js/config.js. Follow README step 3, redeploy, then come back.'));
    return fit(t);
  }
  const authed = await isAuthorized(t);
  app.append(el('p', {}, authed
    ? 'Keel can act on your behalf in this workspace (card history, checklists, routines, bulk and scheduled actions).'
    : 'Allow Keel to read and update cards on your behalf. This is needed for card history, checklist tools, routines, bulk and scheduled actions. Access is granted per workspace.'));
  app.append(el('p', { class: 'row' },
    el('button', { class: authed ? '' : 'primary', onclick: async () => {
      try { await authorize(t); setStatus('Authorised', 'success'); t.closePopup(); } catch (err) { setStatus(err.message || 'Authorisation cancelled', 'error'); }
    } }, authed ? 'Authorise again' : 'Authorise')));
  if (authed) app.append(el('p', { class: 'muted' }, el('small', {}, 'To revoke access, remove Keel from the connected apps in your Atlassian account settings.')));
  fit(t);
}
t.render(render);
