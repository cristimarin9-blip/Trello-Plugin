// OAuth 2.0 redirect page: must call redirectUriCallback() so the authorize() call in
// the Keel window that started sign-in can exchange the code for tokens. That window
// must still be open; if it is not, explain how to finish.
import { initIframe } from '../lib/iframe.js';
import { el, setStatus } from '../lib/util.js';

const t = initIframe();

function explain(message) {
  const lost = !window.opener || window.opener.closed || /opener/i.test(String(message));
  const app = document.getElementById('app');
  app.textContent = '';
  app.append(
    el('p', {}, el('strong', {}, 'Sign-in did not finish.')),
    lost
      ? el('p', {}, 'The Keel window that started sign-in was closed (or Trello reloaded it) before this window came back, so it could not receive the result.')
      : el('p', {}, `Trello reported: ${message}`),
    el('p', {}, 'To finish:'),
    el('ol', {},
      el('li', {}, 'Close this window.'),
      el('li', {}, 'In Trello, open Keel\'s settings (the Power-Up\'s gear icon) and click Authorise. A Keel window opens with an Authorise button: click it.'),
      el('li', {}, 'Click Allow, and keep the Keel window open until this sign-in window closes by itself.')));
  setStatus('');
}

window.addEventListener('load', async () => {
  if (!window.opener || window.opener.closed) return explain('opener closed');
  try {
    await t.getOAuth2ApiClient().redirectUriCallback();
  } catch (err) {
    explain(err && err.message ? err.message : err);
  }
});
