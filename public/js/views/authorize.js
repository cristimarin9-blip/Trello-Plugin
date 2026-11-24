// Authorisation page, opened as a Trello modal. Trello's sign-in window hands the
// result back to the window that opened it, so this page must stay open until the
// sign-in window closes itself. A modal does; a popover closes as soon as focus
// moves to the sign-in window, which loses the result.
import { initIframe, fit } from '../lib/iframe.js';
import { authorize, isAuthorized, isConfigured } from '../lib/trello-api.js';
import { byId, clear, el, setStatus } from '../lib/util.js';

const t = initIframe();
const app = byId('app');
let busy = false;

function close() {
  return Promise.resolve().then(() => t.closeModal()).catch(() => t.closePopup()).catch(() => {});
}

async function start(button) {
  busy = true;
  button.disabled = true;
  setStatus('Waiting for you to click Allow in the sign-in window. Keep this window open until that one closes by itself…');
  try {
    await authorize(t);
    busy = false;
    clear(app);
    app.append(el('p', { class: 'auth-ok' }, '✅ Keel is authorised for this workspace.'));
    setStatus('');
    fit(t);
    setTimeout(close, 1500);
  } catch (err) {
    busy = false;
    button.disabled = false;
    setStatus(`${err && err.message ? err.message : 'Authorisation was cancelled'}. Try again, and keep this window open until the sign-in window closes by itself.`, 'error');
    fit(t);
  }
}

async function render() {
  if (busy) return;
  clear(app);
  if (!isConfigured()) {
    app.append(el('p', { class: 'notice' }, 'OAUTH_CLIENT_ID is not set in public/js/config.js. Follow README step 3, redeploy, then come back.'));
    return fit(t);
  }
  const authed = await isAuthorized(t);
  app.append(el('p', {}, authed
    ? 'Keel can already act on your behalf in this workspace. Authorise again only if something says access is missing.'
    : 'Allow Keel to read and update cards on your behalf. This is needed for Fields, card history, checklist tools, routines, bulk and scheduled actions. Access is granted per workspace.'));
  app.append(el('ol', { class: 'auth-steps' },
    el('li', {}, 'Click ', el('strong', {}, authed ? 'Authorise again' : 'Authorise'), ' below.'),
    el('li', {}, 'In the window that opens, check the workspace and click ', el('strong', {}, 'Allow'), '.'),
    el('li', {}, 'That window closes by itself. ', el('strong', {}, 'Keep this window open'), ' until it does.')));
  const button = el('button', { class: authed ? '' : 'primary', onclick: () => start(button) }, authed ? 'Authorise again' : 'Authorise');
  app.append(el('p', { class: 'row' }, button, el('button', { onclick: close }, authed ? 'Close' : 'Not now')));
  if (authed) app.append(el('p', { class: 'muted' }, el('small', {}, 'To revoke access, remove Keel from the connected apps in your Atlassian account settings.')));
  fit(t);
}
t.render(render);
