// Trello REST API access using the token granted through t.getRestApi().
// Everything that Power-Up client data cannot do (card history, checklists,
// creating/moving cards, bulk edits) goes through here.
import { APP_KEY } from '../config.js';

const BASE = 'https://api.trello.com/1';

export class NotAuthorizedError extends Error {
  constructor() {
    super('Not authorised: click "Authorize" in the Power-Up settings first.');
    this.name = 'NotAuthorizedError';
  }
}

export function hasAppKey() {
  return APP_KEY && !APP_KEY.startsWith('REPLACE_WITH');
}

export async function isAuthorized(t) {
  if (!hasAppKey()) return false;
  try {
    return await t.getRestApi().isAuthorized();
  } catch (err) {
    console.warn('isAuthorized failed', err);
    return false;
  }
}

export async function getToken(t) {
  if (!(await isAuthorized(t))) throw new NotAuthorizedError();
  return t.getRestApi().getToken();
}

/** Must be called from a user gesture (button click) because it opens a popup window. */
export function authorize(t, scope = { read: true, write: true }) {
  if (!hasAppKey()) {
    return Promise.reject(new Error('Set APP_KEY in public/js/config.js first (README step 3).'));
  }
  return t.getRestApi().authorize({ scope, expiration: 'never' });
}

export function clearToken(t) {
  return t.getRestApi().clearToken();
}

/**
 * api(t, 'GET', '/cards/abc/actions', { limit: 50 })
 * api(t, 'PUT', '/cards/abc', { closed: true })
 */
export async function api(t, method, path, params = {}) {
  const token = await getToken(t);
  const url = new URL(BASE + path);
  url.searchParams.set('key', APP_KEY);
  url.searchParams.set('token', token);
  const init = { method, headers: { Accept: 'application/json' } };
  if (method === 'GET' || method === 'DELETE') {
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  } else {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(params);
  }
  const res = await fetch(url.toString(), init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Trello API ${method} ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

// --- Convenience wrappers -------------------------------------------------

export const cards = {
  actions: (t, cardId, limit = 50) => api(t, 'GET', `/cards/${cardId}/actions`, { filter: 'all', limit }),
  checklists: (t, cardId) =>
    api(t, 'GET', `/cards/${cardId}/checklists`, { checkItems: 'all', checkItem_fields: 'name,pos,state', fields: 'name,pos' }),
  update: (t, cardId, fields) => api(t, 'PUT', `/cards/${cardId}`, fields),
  create: (t, fields) => api(t, 'POST', '/cards', fields),
  addLabel: (t, cardId, labelId) => api(t, 'POST', `/cards/${cardId}/idLabels`, { value: labelId }),
  addMember: (t, cardId, memberId) => api(t, 'POST', `/cards/${cardId}/idMembers`, { value: memberId }),
  updateCheckItem: (t, cardId, itemId, fields) => api(t, 'PUT', `/cards/${cardId}/checkItem/${itemId}`, fields)
};

export const checklists = {
  create: (t, cardId, name, pos = 'bottom') => api(t, 'POST', '/checklists', { idCard: cardId, name, pos }),
  addItem: (t, checklistId, name, pos = 'bottom') => api(t, 'POST', `/checklists/${checklistId}/checkItems`, { name, pos }),
  deleteItem: (t, checklistId, itemId) => api(t, 'DELETE', `/checklists/${checklistId}/checkItems/${itemId}`)
};
