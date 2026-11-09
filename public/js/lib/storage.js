// Thin wrappers over Trello pluginData (t.get / t.set / t.remove).
// `scope` may be 'card', 'board', 'member', 'organization' or a card id.
import { STORAGE_LIMIT } from '../config.js';
import { jsonSize } from './util.js';

export function get(t, scope, key, fallback) {
  return t.get(scope, 'shared', key, fallback);
}

export function set(t, scope, key, value) {
  return t.set(scope, 'shared', key, value);
}

export function remove(t, scope, key) {
  return t.remove(scope, 'shared', key);
}

export function getAllShared(t, scope) {
  return t.getAll().then((all) => (all && all[scope] && all[scope].shared) || {});
}

/** Approximate how full the 4096-char bucket is after writing `key = value`. */
export async function projectedUsage(t, scope, key, value) {
  const current = await getAllShared(t, scope);
  const next = { ...current, [key]: value };
  return { size: jsonSize(next), limit: STORAGE_LIMIT, ratio: jsonSize(next) / STORAGE_LIMIT };
}

export function getSettings(t) {
  return get(t, 'board', 'settings', {}).then((s) => ({
    chProxyUrl: '',
    stageBadges: true,
    recordViews: true,
    ...(s || {})
  }));
}
