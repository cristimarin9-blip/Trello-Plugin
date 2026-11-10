// Trello REST API access using OAuth 2.0 tokens from t.getOAuth2ApiClient().
// Everything that Power-Up client data cannot do (card history, checklists,
// creating/moving cards, bulk edits) goes through here.
//
// Tokens are issued per user and per workspace (Power-Up OAuth 2.0 clients are
// workspace-restricted). The client library stores them in plugin data and
// refreshes access tokens automatically; refresh tokens expire after 90 days,
// after which getAccessToken() returns null and the user must authorise again.
import { OAUTH_CLIENT_ID, OAUTH_SCOPES } from '../config.js';

const BASE = 'https://api.trello.com/1';

export class NotAuthorizedError extends Error {
  constructor() {
    super('Not authorised: open the Power-Up settings and click "Authorise" first.');
    this.name = 'NotAuthorizedError';
  }
}

export function isConfigured() {
  return !!OAUTH_CLIENT_ID && !OAUTH_CLIENT_ID.startsWith('REPLACE_WITH');
}

function client(t) {
  if (!isConfigured()) throw new Error('OAUTH_CLIENT_ID is not set in public/js/config.js (README step 3).');
  return t.getOAuth2ApiClient();
}

/** Current access token, or null when the user has not authorised (or the refresh token expired). */
export async function getToken(t) {
  if (!isConfigured()) return null;
  try {
    return (await client(t).getAccessToken()) || null;
  } catch (err) {
    console.warn('getAccessToken failed', err);
    return null;
  }
}

export async function isAuthorized(t) {
  return !!(await getToken(t));
}

/** Must be called from a user gesture (button click): it opens Trello's consent popup. */
export function authorize(t) {
  return client(t).authorize({ scopes: OAUTH_SCOPES });
}

/**
 * api(t, 'GET', '/cards/abc/actions', { limit: 50 })
 * api(t, 'PUT', '/cards/abc', { closed: true })
 */
export async function api(t, method, path, params = {}) {
  const token = await getToken(t);
  if (!token) throw new NotAuthorizedError();
  const url = new URL(BASE + path);
  const init = { method, headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } };
  if (method === 'GET' || method === 'DELETE') {
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  } else {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(params);
  }
  const res = await fetch(url.toString(), init);
  if (res.status === 401) throw new NotAuthorizedError();
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
