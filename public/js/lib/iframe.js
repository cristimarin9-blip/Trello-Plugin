// Bootstraps an iframe page (popup, modal or card-back section).
import { APP_KEY, APP_NAME } from '../config.js';

export function initIframe(options = {}) {
  const t = window.TrelloPowerUp.iframe({ appKey: APP_KEY, appName: APP_NAME, ...options });
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
