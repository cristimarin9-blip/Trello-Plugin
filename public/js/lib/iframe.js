// Bootstraps an iframe page (popup, modal or card-back section).
import { OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI } from '../config.js';

export function initIframe(options = {}) {
  const t = window.TrelloPowerUp.iframe({ clientId: OAUTH_CLIENT_ID, redirectUri: OAUTH_REDIRECT_URI, ...options });
  return t;
}

/** Resize the iframe to its content; safe to call repeatedly. */
export function fit(t, min = 0) {
  requestAnimationFrame(() => {
    const height = Math.max(min, document.documentElement.scrollHeight);
    t.sizeTo(height).catch(() => {});
  });
}

export function iconUrl(name) {
  return new URL(`../../img/${name}`, import.meta.url).href;
}
