// Runs the Cloudflare Worker in Node against a real SQLite database (node:sqlite)
// standing in for D1, with Trello and Companies House simulated.
// Run: node --no-warnings scripts/worker-test.mjs   (Node 22.5+)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// --- D1 stand-in -------------------------------------------------------------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    const stmt = sqlite.prepare(sql);
    let args = [];
    const api = {
      bind(...a) { args = a; return api; },
      async first() { return stmt.get(...args) ?? null; },
      async all() { return { results: stmt.all(...args) }; },
      async run() { const r = stmt.run(...args); return { meta: { changes: Number(r.changes) } }; }
    };
    return api;
  }
};

// --- Trello / Cache stand-ins ---------------------------------------------
const BOARD = 'b'.repeat(24);
const OTHER_BOARD = 'c'.repeat(24);
const CARD = 'a'.repeat(24);
const CARD2 = 'd'.repeat(24);
const STRANGER_CARD = 'e'.repeat(24);
const access = { 'good-token-1': { boards: [BOARD], cards: { [CARD]: BOARD, [CARD2]: BOARD } } };
let trelloCalls = 0;
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
globalThis.fetch = async (url, init) => {
  const u = new URL(url);
  assert.equal(u.host, 'api.trello.com', `unexpected fetch ${url}`);
  trelloCalls += 1;
  const token = (init.headers.Authorization || '').replace('Bearer ', '');
  const who = access[token];
  if (!who) return new Response('invalid token', { status: 401 });
  let m = u.pathname.match(/^\/1\/cards\/([0-9a-f]{24})$/);
  if (m) return who.cards[m[1]] ? Response.json({ id: m[1], idBoard: who.cards[m[1]] }) : new Response('not found', { status: 404 });
  m = u.pathname.match(/^\/1\/boards\/([0-9a-f]{24})$/);
  if (m) return who.boards.includes(m[1]) ? Response.json({ id: m[1] }) : new Response('unauthorized', { status: 401 });
  return new Response('?', { status: 400 });
};

const worker = (await import('../worker/src/index.js')).default;
const env = { DB, CH_API_KEY: 'k', ALLOWED_ORIGINS: 'https://cristimarin9-blip.github.io' };
const ctx = { waitUntil() {} };
async function call(method, path, { token = 'good-token-1', body } = {}) {
  const headers = { Origin: 'https://cristimarin9-blip.github.io', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await worker.fetch(new Request(`https://w.dev${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
}

// CORS preflight allows the methods and Authorization header Fields needs.
const pre = await worker.fetch(new Request('https://w.dev/fields/card/x', { method: 'OPTIONS', headers: { Origin: 'https://cristimarin9-blip.github.io' } }), env, ctx);
assert.equal(pre.status, 204);
assert.match(pre.headers.get('Access-Control-Allow-Methods'), /PATCH/);
assert.match(pre.headers.get('Access-Control-Allow-Headers'), /Authorization/);

// Access control.
assert.equal((await call('GET', `/fields/board/${BOARD}`, { token: null })).status, 401, 'no token');
assert.equal((await call('GET', `/fields/board/${BOARD}`, { token: 'stolen-token-1' })).status, 403, 'bad token');
assert.equal((await call('GET', `/fields/board/${OTHER_BOARD}`)).status, 403, 'board the user cannot open');
assert.equal((await call('GET', `/fields/card/${STRANGER_CARD}`)).status, 403, 'card the user cannot open');
assert.equal((await call('GET', '/fields/card/not-an-id')).status, 400);

// Empty board.
let r = await call('GET', `/fields/board/${BOARD}`);
assert.equal(r.status, 200);
assert.deepEqual(r.body, { fields: [], updatedAt: 0, views: [], cards: {} });
assert.equal(r.headers.get('Cache-Control'), 'no-store');

// Define fields.
const fields = [
  { id: 'vat', name: 'VAT Status', type: 'choice', badge: true, options: [{ id: 'v', label: 'VAT', color: 'green' }, { id: 'n', label: 'Non-VAT', color: 'nope' }] },
  { id: 'num', name: 'Company Number', type: 'text' },
  { id: 'chk', name: 'Accounts Schedules Things to Check', type: 'notes', badge: true },
  { id: 'ye', name: 'Year end', type: 'date', shown: false },
  { id: 'fee', name: 'Fee', type: 'number' },
  { id: 'aml', name: 'AML done', type: 'checkbox' }
];
r = await call('PUT', `/fields/board/${BOARD}`, { body: { fields, updatedAt: 0 } });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.fields[0].options[1].color, 'light-gray', 'unknown colours fall back');
assert.equal(r.body.fields[2].badge, false, 'notes cannot be badges');
assert.equal(r.body.fields[3].shown, false);
const v1 = r.body.updatedAt;
assert.ok(v1 > 0);
// Stale edit is refused; current version accepted.
assert.equal((await call('PUT', `/fields/board/${BOARD}`, { body: { fields, updatedAt: 0 } })).status, 409);
assert.equal((await call('PUT', `/fields/board/${BOARD}`, { body: { fields: [{ id: 'x', name: '', type: 'text' }], updatedAt: v1 } })).status, 400);
assert.equal((await call('PUT', `/fields/board/${BOARD}`, { body: { fields: [{ id: 'x', name: 'X', type: 'choice', options: [] }], updatedAt: v1 } })).status, 400);

// Card values.
r = await call('GET', `/fields/card/${CARD}`);
assert.equal(r.status, 200);
assert.equal(r.body.boardId, BOARD);
assert.equal(r.body.fields.length, 6);
assert.deepEqual(r.body.values, {});
assert.equal(r.body.visible, null);

const notes = 'Debtors\n- August 2026 sales missing\n- Sales not received?\n\nCreditors\n- Wages - 750.80 difference';
r = await call('PATCH', `/fields/card/${CARD}`, { body: { values: { vat: 'v', num: ' 01234567 ', chk: notes, fee: '1,250.50', aml: true, ye: '2026-08-31' } } });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.deepEqual(r.body.values, { vat: 'v', num: '01234567', chk: notes, fee: 1250.5, aml: true, ye: '2026-08-31' });

// Two people editing different fields do not overwrite each other; null clears a value.
await call('PATCH', `/fields/card/${CARD}`, { body: { values: { num: '07654321' } } });
r = await call('PATCH', `/fields/card/${CARD}`, { body: { values: { fee: null, aml: false } } });
assert.deepEqual(r.body.values, { vat: 'v', num: '07654321', chk: notes, ye: '2026-08-31' });

// Visible fields: set, filtered to known ids, reset to board default.
r = await call('PATCH', `/fields/card/${CARD}`, { body: { visible: ['vat', 'chk', 'ghost'] } });
assert.deepEqual(r.body.visible, ['vat', 'chk']);
r = await call('PATCH', `/fields/card/${CARD}`, { body: { values: { num: '1' } } });
assert.deepEqual(r.body.visible, ['vat', 'chk'], 'value edits keep the visible list');
r = await call('PATCH', `/fields/card/${CARD}`, { body: { visible: null } });
assert.equal(r.body.visible, null);

// Validation errors.
for (const values of [{ vat: 'zzz' }, { fee: 'abc' }, { ye: '31/08/2026' }, { aml: 'yes' }, { ghost: 1 }, { chk: 'x'.repeat(20001) }]) {
  const bad = await call('PATCH', `/fields/card/${CARD}`, { body: { values } });
  assert.equal(bad.status, 400, `${JSON.stringify(values).slice(0, 40)} -> ${bad.status}`);
}
assert.equal((await call('PATCH', `/fields/card/${STRANGER_CARD}`, { body: { values: { num: 'x' } } })).status, 403);

// Board view returns every card's values.
await call('PATCH', `/fields/card/${CARD2}`, { body: { values: { vat: 'n' } } });
r = await call('GET', `/fields/board/${BOARD}`);
assert.deepEqual(Object.keys(r.body.cards).sort(), [CARD, CARD2].sort());
assert.equal(r.body.cards[CARD2].values.vat, 'n');

// New field types, layout fields and display options.
r = await call('GET', `/fields/board/${BOARD}`);
const v2 = r.body.updatedAt;
const rich = [
  ...r.body.fields,
  { id: 'sec', name: 'Accounts Schedules Things to Check', type: 'section', collapsed: true, shown: true, badge: true },
  { id: 'hdr', name: 'Balance sheet', type: 'header', color: 'blue' },
  { id: 'deb', name: 'Debtors', type: 'notes', width: 'half', label: 'left', help: 'What is missing', placeholder: '- item', required: true },
  { id: 'tags', name: 'Services', type: 'multi', options: [{ id: 'bk', label: 'Bookkeeping', color: 'green' }, { id: 'pr', label: 'Payroll', color: 'blue' }] },
  { id: 'stars', name: 'Client rating', type: 'rating', max: 7, badge: true, badgeName: true },
  { id: 'pct', name: 'Progress', type: 'progress' },
  { id: 'web', name: 'Website', type: 'url' },
  { id: 'mail', name: 'Email', type: 'email' },
  { id: 'tel', name: 'Phone', type: 'phone' },
  { id: 'fee2', name: 'Annual fee', type: 'number', format: 'gbp', decimals: 9, width: 'nope' },
  { id: 'st', name: 'Status', type: 'choice', display: 'dropdown', options: [{ id: 'a', label: 'Open' }] }
];
r = await call('PUT', `/fields/board/${BOARD}`, { body: { fields: rich, updatedAt: v2 } });
assert.equal(r.status, 200, JSON.stringify(r.body));
const byId = Object.fromEntries(r.body.fields.map((f) => [f.id, f]));
assert.deepEqual(byId.sec, { id: 'sec', name: 'Accounts Schedules Things to Check', type: 'section', color: '', collapsed: true }, 'layout fields keep only layout props');
assert.equal(byId.hdr.color, 'blue');
assert.equal(byId.deb.width, 'half');
assert.equal(byId.deb.label, 'left');
assert.equal(byId.deb.required, true);
assert.equal(byId.stars.max, 7);
assert.equal(byId.stars.badgeName, true);
assert.equal(byId.fee2.decimals, 2, 'bad decimals fall back');
assert.equal(byId.fee2.width, 'full', 'bad width falls back');
assert.equal(byId.st.display, 'dropdown');
r = await call('PATCH', `/fields/card/${CARD}`, { body: { values: { tags: ['pr', 'bk', 'pr'], stars: 6, pct: '42.25%', web: 'example.com/x', mail: 'a@b.co', tel: '+44 (0)20 7946 0000', fee2: '£1,200' } } });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.deepEqual(r.body.values.tags, ['pr', 'bk']);
assert.equal(r.body.values.pct, 42.3);
assert.equal(r.body.values.web, 'https://example.com/x');
assert.equal(r.body.values.fee2, 1200);
for (const values of [{ sec: 'x' }, { tags: ['zz'] }, { stars: 8 }, { pct: 101 }, { web: 'javascript:alert(1)' }, { mail: 'nope' }, { tel: 'call me' }]) {
  const bad = await call('PATCH', `/fields/card/${CARD}`, { body: { values } });
  assert.equal(bad.status, 400, `${JSON.stringify(values)} -> ${bad.status}`);
}
r = await call('PATCH', `/fields/card/${CARD}`, { body: { visible: ['sec', 'deb', 'tags'] } });
assert.deepEqual(r.body.visible, ['deb', 'tags'], 'layout fields are not part of the visible list');
r = await call('PATCH', `/fields/card/${CARD}`, { body: { values: { tags: [], stars: 0 } } });
assert.equal(r.body.values.tags, undefined, 'empty multi clears');
assert.equal(r.body.values.stars, undefined, 'zero rating clears');

// Saved table views.
r = await call('PUT', `/fields/board/${OTHER_BOARD}/views`, { body: { views: [] } });
assert.equal(r.status, 403);
const views = [{ id: 'main', name: 'Main Table', search: ' acme ', filters: [{ field: 'vat', op: 'is', value: 'v' }, { field: '', op: 'is' }, { field: 'num', op: 'bogus', value: 'x' }], sort: { field: 'ye', dir: -1 }, columns: ['vat', 'ye'], groupBy: '__list', limit: 999 }];
r = await call('PUT', `/fields/board/${BOARD}/views`, { body: { views } });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.deepEqual(r.body.views[0], { id: 'main', name: 'Main Table', search: 'acme', filters: [{ field: 'vat', op: 'is', value: 'v' }, { field: 'num', op: 'is', value: 'x' }], sort: { field: 'ye', dir: -1 }, columns: ['vat', 'ye'], groupBy: '__list', limit: 250 });
r = await call('GET', `/fields/board/${BOARD}`);
assert.equal(r.body.views.length, 1);
assert.equal(r.body.fields.length, rich.length, 'saving views keeps the fields');
assert.equal((await call('PUT', `/fields/board/${BOARD}/views`, { body: { views: [{ id: 'x' }] } })).status, 400);
assert.equal((await call('PUT', `/fields/card/${CARD}/views`, { body: { views: [] } })).status, 404);
// Views on a board that has no fields yet.
access['good-token-1'].boards.push('f'.repeat(24));
r = await call('PUT', `/fields/board/${'f'.repeat(24)}/views`, { body: { views: [{ id: 'v', name: 'V' }] } });
assert.equal(r.status, 200);
r = await call('PUT', `/fields/board/${'f'.repeat(24)}`, { body: { fields: [{ id: 'a', name: 'A', type: 'text' }], updatedAt: 0 } });
assert.equal(r.status, 200, 'first field save works after views were saved');

// Import sample is stored.
r = await call('POST', `/fields/board/${BOARD}/sample`, { body: { board: [{ idPlugin: 'p', value: '{}' }] } });
assert.equal(r.status, 200);
assert.equal(sqlite.prepare('SELECT count(*) AS n FROM import_samples').get().n, 1);

// Access checks are cached: repeating a call does not ask Trello again.
const before = trelloCalls;
await call('GET', `/fields/card/${CARD}`);
assert.equal(trelloCalls, before);

// Companies House routes are unaffected and still GET-only.
assert.equal((await call('POST', '/company/00000006', { body: {} })).status, 405);
assert.equal((await call('GET', '/health', { token: null })).status, 200);

console.log('✓ worker fields tests passed');
