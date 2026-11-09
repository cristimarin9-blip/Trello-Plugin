// Feature: settings popup and REST authorisation.
import { isAuthorized } from '../lib/trello-api.js';
import { KEYS } from '../config.js';
import { remove } from '../lib/storage.js';

export function showSettings(t) {
  return t.popup({ title: 'Keel settings', url: './views/settings.html', height: 420 });
}

export async function authorizationStatus(t) {
  return { authorized: await isAuthorized(t) };
}

export function showAuthorization(t) {
  return t.popup({ title: 'Authorise Trello access', url: './views/authorize.html', height: 180 });
}

export async function removeData(t) {
  await Promise.all(Object.values(KEYS).map((key) => remove(t, 'board', key).catch(() => {})));
}
