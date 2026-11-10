// OAuth 2.0 redirect page: must call redirectUriCallback() so the authorize()
// call in the originating iframe can exchange the code for tokens.
import { initIframe } from '../lib/iframe.js';
import { setStatus } from '../lib/util.js';

const t = initIframe();
window.addEventListener('load', async () => {
  try {
    await t.getOAuth2ApiClient().redirectUriCallback();
  } catch (err) {
    setStatus(`Authorisation could not be completed: ${err.message || err}. Close this window and try again.`, 'error');
  }
});
