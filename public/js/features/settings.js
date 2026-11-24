// Feature: settings popup and REST authorisation.
import { isAuthorized } from '../lib/trello-api.js';
import { KEYS } from '../config.js';
import { remove } from '../lib/storage.js';
import { viewUrl } from '../lib/util.js';

export function showSettings(t) {
  return t.popup({ title: 'Keel settings', url: viewUrl('settings.html'), height: 420 });
}

export async function authorizationStatus(t) {
  return { authorized: await isAuthorized(t) };
}

/**
 * Sign-in runs in a modal, not a popover: Trello closes popovers when focus moves to
 * the sign-in window, and the result would then have nowhere to go.
 * `onClose` runs when the modal closes (e.g. to refresh the page that asked).
 */
export function openAuthorize(t, onClose) {
  return t.modal({ title: 'Authorise Keel', url: viewUrl('authorize.html'), fullscreen: false, height: 340, callback: onClose ? () => onClose() : undefined });
}

export function showAuthorization(t) {
  return openAuthorize(t);
}

export async function removeData(t) {
  await Promise.all(Object.values(KEYS).map((key) => remove(t, 'board', key).catch(() => {})));
}
