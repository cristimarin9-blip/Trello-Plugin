// Loads every page in a headless browser with a mocked Trello client and fails
// on any JavaScript error. Run: npm run smoke   (needs Playwright + Chromium)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 8765;
const BASE = `http://127.0.0.1:${PORT}`;

const MOCK = `
(() => {
  const data = {};
  const bucket = (scope) => (data[scope] ||= { shared: {} }).shared;
  const cardsList = [
    { id: 'c1', name: 'Acme Ltd — year end', idList: 'l1', dueComplete: false, labels: [{ id: 'lb1', name: 'VAT', color: 'green' }], members: [], due: '2026-12-01T17:00:00.000Z' },
    { id: 'c2', name: 'Beta Ltd — bookkeeping', idList: 'l2', dueComplete: true, labels: [], members: [] }
  ];
  function makeT() {
    return {
      get: async (scope, vis, key, def) => (key in bucket(scope) ? bucket(scope)[key] : def),
      set: async (scope, vis, key, val) => { bucket(scope)[key] = val; },
      remove: async (scope, vis, key) => { delete bucket(scope)[key]; },
      getAll: async () => data,
      card: async () => ({ id: 'c1', name: 'Acme Ltd — year end', idList: 'l1', dueComplete: false }),
      cards: async () => cardsList,
      lists: async () => [{ id: 'l1', name: 'To do' }, { id: 'l2', name: 'Done' }],
      list: async () => ({ id: 'l1', name: 'To do' }),
      board: async () => ({ id: 'b1', name: 'Board', labels: [{ id: 'lb1', name: 'VAT', color: 'green' }], members: [{ id: 'm1', fullName: 'Ann Example', username: 'ann' }] }),
      member: async () => ({ id: 'm1', fullName: 'Ann Example', username: 'ann' }),
      arg: (k) => new URLSearchParams(location.search).get(k),
      render: (fn) => { window.__render = fn; return fn(); },
      sizeTo: async () => {}, signUrl: (u) => u, popup: async (o) => { window.__lastPopup = o; }, modal: async (o) => { window.__lastModal = o; }, closePopup: async () => {}, closeModal: async () => {},
      showCard: async () => {}, alert: () => {},
      getOAuth2ApiClient: () => ({ getAccessToken: async () => window.__token || null, authorize: async () => {}, redirectUriCallback: async () => {} })
    };
  }
  window.TrelloPowerUp = {
    initialize: (caps) => { window.__caps = caps; },
    iframe: () => makeT()
  };
  window.__makeT = makeT;
  window.__seed = () => {
    bucket('card').priority = 'high';
    bucket('card').company = { number: '00000006', name: 'TEST LTD', status: 'active', accountsDue: '2026-12-31', csDue: '2026-11-30', accountsMadeUpTo: '2026-03-31', ctPaymentDue: '2027-01-01', officers: [{ n: 'DOE, Jane', r: 'director', a: '2010-01-01' }], fetchedAt: Date.now() };
    bucket('card').crm = { vat: { on: true, stage: 'In progress', period: '2026-06-30' }, accounts: { on: true, stage: 'Filed', period: '2026-03-31' } };
    bucket('card').children = ['c2'];
    bucket('card').views = { total: 3, viewers: { m1: { n: 'Ann Example', u: 'ann', at: Date.now(), c: 3 } } };
    bucket('card').schedule = [{ id: 'x', type: 'archive', temp: true, at: Date.now() + 86400000 }];
    bucket('c1').priority = 'urgent'; bucket('c1').crm = bucket('card').crm; bucket('c1').company = bucket('card').company; bucket('c1').views = bucket('card').views;
    bucket('board').routines = [{ id: 'r1', name: 'VAT quarter', steps: ['Request records', '↳ Chase if late', 'Prepare return'] }];
    bucket('board').audit = { members: { m1: { n: 'Ann Example', u: 'ann', first: Date.now() - 1e8, last: Date.now(), v: 4 } }, log: [{ m: 'm1', at: Date.now() }] };
    bucket('board').scheduleLog = [{ at: Date.now(), card: 'Old card', what: 'Archive', ok: true }];
  };
})();`;

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', 'public'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const problems = [];
const browser = await chromium.launch();
const context = await browser.newContext();
await context.route('https://p.trellocdn.com/power-up.min.js', (route) => route.fulfill({ contentType: 'application/javascript', body: MOCK }));

async function visit(path, seed, after) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => { if (!r.url().includes('trellocdn')) errors.push(`request failed: ${r.url()}`); });
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  if (seed) { await page.evaluate(() => { window.__seed(); return window.__render ? window.__render() : null; }); await page.waitForTimeout(300); }
  if (after) await after(page, errors);
  await page.waitForTimeout(200);
  const text = (await page.textContent('body')).trim().replace(/\s+/g, ' ').slice(0, 90);
  console.log(`${errors.length ? '✗' : '✓'} ${path}  ${text}`);
  errors.forEach((e) => problems.push(`${path}: ${e}`));
  await page.close();
}

// Connector: every capability must resolve with the mocked client.
await visit('/index.html', false, async (page, errors) => {
  const result = await page.evaluate(async () => {
    const t = window.__makeT();
    window.__seed();
    const out = {};
    for (const [name, fn] of Object.entries(window.__caps)) {
      try {
        if (name === 'board-buttons') { const bs = await fn(t); for (const b of bs) { window.__lastModal = null; await b.callback(t); const o = window.__lastModal || window.__lastPopup; const r = await fetch(o.url); if (r.status !== 200) throw new Error(`${b.text} opens ${o.url} (${r.status})`); } out[name] = bs.map((b) => b.text); }
        else if (name === 'list-sorters') { const s = await fn(t); out[name] = await s[0].callback(t, { cards: await t.cards() }); }
        else if (['show-settings', 'show-authorization', 'on-enable', 'remove-data'].includes(name)) { await fn(t); out[name] = 'ok'; }
        else out[name] = await fn(t);
      } catch (e) { out[name] = `ERROR ${e.message}`; }
    }
    // Feature switches: per-card override, then board default.
    await t.set('card', 'shared', 'features', { priority: true, company: false, crm: true, subtasks: true, checklist: true, history: true, viewers: true, schedule: false, routines: true });
    out.__afterOverride = { badges: (await window.__caps['card-badges'](t)).map((b) => b.text), buttons: (await window.__caps['card-buttons'](t)).map((b) => b.text) };
    await t.remove('card', 'shared', 'features');
    await t.set('board', 'shared', 'settings', { defaults: { crm: false } });
    out.__afterDefault = { badges: (await window.__caps['card-badges'](t)).map((b) => b.text) };
    await t.remove('board', 'shared', 'settings');
    return out;
  });
  const ov = result.__afterOverride;
  if (ov.badges.some((b) => /Accounts|Temp/.test(b)) || ov.buttons.some((b) => /Schedule|Temporary/.test(b))) errors.push(`feature override not respected: ${JSON.stringify(ov)}`);
  if (!ov.badges.some((b) => b.startsWith('⬆'))) errors.push('priority badge should remain with override');
  if (result.__afterDefault.badges.some((b) => b.startsWith('VAT'))) errors.push(`board default not respected: ${JSON.stringify(result.__afterDefault)}`);
  console.log('  after override:', ov.badges.join(' | '), '//', ov.buttons.join(' | '));
  delete result.__afterOverride; delete result.__afterDefault;
  for (const [k, v] of Object.entries(result)) {
    if (typeof v === 'string' && v.startsWith('ERROR')) errors.push(`${k}: ${v}`);
  }
  const badges = result['card-badges'] || [];
  if (!Array.isArray(badges) || badges.length < 4) errors.push(`expected several card badges, got ${JSON.stringify(badges)}`);
  console.log('  capabilities:', Object.keys(result).join(', '));
  console.log('  card-badges:', badges.map((b) => b.text).join(' | '));
  console.log('  sorter:', JSON.stringify(result['list-sorters']));
});

await visit('/views/card-back.html', true, async (page) => {
  const count = await page.locator('.tabs button').count();
  for (let i = 0; i < count; i += 1) {
    await page.locator('.tabs button').nth(i).click();
    await page.waitForTimeout(300);
    const label = await page.locator('.tabs button').nth(i).textContent();
    const body = (await page.locator('#tab-body').textContent()).trim().replace(/\s+/g, ' ').slice(0, 70);
    console.log(`  tab ${label}: ${body}`);
  }
});
// Company tab: search by name, pick a result, snapshot is saved; a pre-search worker gives a clear message.
const PROXY = 'https://proxy.test';
const companyJson = { number: 'SC000001', name: 'ACME (SCOTLAND) LTD', status: 'active', type: 'ltd', incorporated: '2001-02-03', address: '2 Road, Glasgow', sic: [],
  accounts: { nextDue: '2026-12-31', nextMadeUpTo: '2026-03-31', overdue: false, lastMadeUpTo: '2025-03-31', ard: '31/03' },
  confirmation: { nextDue: '2026-12-01', nextMadeUpTo: '2026-11-17', overdue: false }, officers: [] };
let oldWorker = false;
const proxyCalls = [];
const fakeWorker = (route) => {
  proxyCalls.push(route.request().url());
  const url = new URL(route.request().url());
  const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  if (url.pathname === '/search') return oldWorker ? reply(404, { error: 'Use /company/{companyNumber}' }) : reply(200, { items: [
    { number: 'SC000001', name: 'ACME (SCOTLAND) LTD', status: 'active', incorporated: '2001-02-03', address: '2 Road, Glasgow' },
    { number: '00000099', name: 'ACME OLD LTD', status: 'dissolved', address: '9 Lane, Leeds' }] });
  if (url.pathname === '/company/SC000001') return reply(200, companyJson);
  return reply(404, { error: 'Company not found' });
};
await context.route(`${PROXY}/**`, fakeWorker);
await context.route('https://trello-companies-house-proxy.kabooom.workers.dev/**', fakeWorker);
await visit('/views/card-back.html', false, async (page, errors) => {
  // No board Proxy URL saved: the built-in CH_PROXY_URL is used.
  await page.locator('.tabs button', { hasText: 'Company' }).click();
  await page.locator('#tab-body input[type=text]').fill('acme');
  await page.locator('#tab-body button.primary').click();
  await page.locator('#tab-body .card-list li').first().waitFor();
  if (!proxyCalls.some((u) => u.startsWith('https://trello-companies-house-proxy.kabooom.workers.dev/search'))) errors.push(`default proxy not used: ${proxyCalls.join(', ')}`);
  await page.evaluate((proxy) => { const t = window.__makeT(); return t.set('board', 'shared', 'settings', { chProxyUrl: proxy }).then(() => window.__render()); }, PROXY);
  await page.locator('.tabs button', { hasText: 'Company' }).click();
  const input = page.locator('#tab-body input[type=text]');
  const button = page.locator('#tab-body button.primary');
  await input.fill('acme');
  if ((await button.textContent()) !== 'Search') errors.push(`button should read Search for a name, got ${await button.textContent()}`);
  await button.click();
  await page.locator('#tab-body .card-list li').first().waitFor();
  const rows = await page.locator('#tab-body .card-list li').count();
  if (rows !== 2) errors.push(`expected 2 search results, got ${rows}`);
  await page.locator('#tab-body .card-list li', { hasText: 'ACME (SCOTLAND) LTD' }).click();
  await page.locator('#tab-body dl.kv').first().waitFor();
  const saved = await page.evaluate(() => window.__makeT().get('card', 'shared', 'company'));
  if (!saved || saved.number !== 'SC000001' || saved.accountsDue !== '2026-12-31') errors.push(`snapshot not saved after picking: ${JSON.stringify(saved)}`);
  if (!(await page.locator('#tab-body').textContent()).includes('ACME (SCOTLAND) LTD')) errors.push('picked company not shown');
  await input.fill('sc 000001');
  if ((await button.textContent()) !== 'Refresh') errors.push(`button should read Refresh for the saved number, got ${await button.textContent()}`);
  oldWorker = true;
  await input.fill('acme');
  await button.click();
  await page.waitForTimeout(300);
  const status = await page.locator('#status').textContent();
  // The browser logs the deliberate 404 from the simulated old worker; that one is expected.
  for (let i = errors.length - 1; i >= 0; i -= 1) if (/status of 404/.test(errors[i])) errors.splice(i, 1);
  if (!/updated proxy worker/.test(status)) errors.push(`old worker should explain the update, got: ${status}`);
  console.log('  search flow: results', rows, '· saved', saved && saved.name, '· old worker:', status.slice(0, 60));
});

// --- Fields: set up, fill in, visible fields, badges, table + CSV -----------------
const store = { boards: {}, cards: {} };
const fieldRequests = [];
await context.route('https://trello-companies-house-proxy.kabooom.workers.dev/fields/**', async (route) => {
  const req = route.request();
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, PATCH, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Accept, Content-Type, Authorization' };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  const reply = (status, body) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
  if (req.headers().authorization !== 'Bearer test-token') return reply(401, { error: 'Authorise Keel first' });
  const [, kind, id] = new URL(req.url()).pathname.match(/^\/fields\/(board|card)\/([^/]+)/);
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  fieldRequests.push(`${req.method()} ${kind}`);
  const boardOf = () => store.boards.b1 || { fields: [], updatedAt: 0 };
  if (kind === 'board' && req.method() === 'GET') return reply(200, { ...boardOf(), cards: store.cards });
  if (kind === 'board' && req.method() === 'PUT') {
    if (body.updatedAt !== boardOf().updatedAt) return reply(409, { error: 'Someone else changed the fields' });
    store.boards.b1 = { fields: body.fields, updatedAt: Date.now() };
    return reply(200, store.boards.b1);
  }
  const card = store.cards[id] || { values: {}, visible: null };
  if (req.method() === 'GET') return reply(200, { boardId: 'b1', fields: boardOf().fields, values: card.values, visible: card.visible });
  if (body.values) for (const [k, v] of Object.entries(body.values)) { if (v === null || v === false) delete card.values[k]; else card.values[k] = v; }
  if ('visible' in body) card.visible = body.visible;
  store.cards[id] = card;
  return reply(200, { boardId: 'b1', values: card.values, visible: card.visible });
});

async function fieldsPage(path) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.addInitScript(() => { window.__token = 'test-token'; });
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  return { page, errors };
}
// SHOTS=dir npm run smoke  saves screenshots of the Fields pages.
const shot = (page, name) => (process.env.SHOTS ? page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }) : null);
const done = async ({ page, errors }, label) => { errors.forEach((e) => problems.push(`${label}: ${e}`)); console.log(`${errors.length ? '✗' : '✓'} ${label}`); await page.close(); };

{ // Card with no fields yet offers set-up.
  const p = await fieldsPage('/views/card-back.html');
  await p.page.locator('.tabs button', { hasText: 'Fields' }).click();
  await p.page.locator('#tab-body button', { hasText: 'Set up fields' }).click();
  // The modal must point at a page that exists when opened from inside the card (views/) iframe.
  const opened = await p.page.evaluate(async () => { const o = window.__lastModal; const r = await fetch(o.url); return { url: o.url, status: r.status, tab: o.args && o.args.tab }; });
  if (opened.status !== 200 || !opened.url.endsWith('/views/fields-board.html') || opened.tab !== 'manage') p.errors.push(`Set up fields opens a broken page: ${JSON.stringify(opened)}`);
  console.log('  set-up opens:', opened.url.replace(BASE, ''), opened.status);
  await done(p, 'fields: empty board offers set-up');
}
{ // Define fields in the board modal.
  const p = await fieldsPage('/views/fields-board.html?tab=manage');
  const { page } = p;
  const add = page.locator('button', { hasText: '+ Add field' });
  await add.click();
  await page.locator('.track').nth(0).locator('input[type=text]').first().fill('VAT Status');
  await page.locator('.track').nth(0).locator('select').first().selectOption('choice');
  await page.locator('.track').nth(0).locator('.options input[type=text]').nth(0).fill('VAT');
  await page.locator('.track').nth(0).locator('button', { hasText: '+ Add option' }).click();
  await page.locator('.track').nth(0).locator('.options input[type=text]').nth(1).fill('Non-VAT');
  await page.locator('.track').nth(0).locator('label', { hasText: 'Badge on card front' }).locator('input').check();
  await add.click();
  await page.locator('.track').nth(1).locator('input[type=text]').first().fill('Accounts Schedules Things to Check');
  await page.locator('.track').nth(1).locator('select').first().selectOption('notes');
  if (!(await page.locator('.track').nth(1).locator('label', { hasText: 'Badge on card front' }).locator('input').isDisabled())) p.errors.push('notes badge should be disabled');
  await add.click();
  await page.locator('.track').nth(2).locator('input[type=text]').first().fill('Year end');
  await page.locator('.track').nth(2).locator('select').first().selectOption('date');
  await page.locator('.track').nth(2).locator('button[aria-label="Move up"]').click();
  await page.locator('button', { hasText: 'Save fields' }).click();
  await page.waitForTimeout(400);
  const names = (store.boards.b1 && store.boards.b1.fields || []).map((f) => `${f.name}:${f.type}`);
  if (names.join('|') !== 'VAT Status:choice|Year end:date|Accounts Schedules Things to Check:notes') p.errors.push(`fields not saved as expected: ${names.join('|')}`);
  if (!/Fields saved/.test(await page.locator('#status').textContent())) p.errors.push('no saved message');
  // Empty name is refused before saving.
  await add.click();
  await page.locator('button', { hasText: 'Save fields' }).click();
  if (!/needs a name/.test(await page.locator('#status').textContent())) p.errors.push('empty field name was not refused');
  await shot(page, 'fields-manage');
  console.log('  fields defined:', names.join(' | '));
  await done(p, 'fields: manage');
}
{ // Fill in a card.
  const p = await fieldsPage('/views/card-back.html');
  const { page } = p;
  await page.locator('.tabs button', { hasText: 'Fields' }).click();
  await page.locator('.segmented button', { hasText: 'Non-VAT' }).click();
  await page.waitForTimeout(300);
  await page.locator('input[type=date]').fill('2026-08-31');
  await page.locator('input[type=date]').dispatchEvent('change');
  await page.waitForTimeout(300);
  await page.locator('.notes-view').click();
  await page.locator('textarea').fill('Debtors\n- August 2026 sales missing\n- Sales not received?\nCreditors\n- Wages - 750.80 difference');
  await page.locator('button', { hasText: 'Save' }).first().click();
  await page.locator('.notes h4').first().waitFor();
  const heads = await page.locator('.notes h4').allTextContents();
  const bullets = await page.locator('.notes li').count();
  if (heads.join('|') !== 'Debtors|Creditors' || bullets !== 3) p.errors.push(`notes rendered wrong: ${heads} / ${bullets}`);
  const card = store.cards.c1 || { values: {} };
  const fieldIds = store.boards.b1.fields.map((f) => f.id);
  const vat = store.boards.b1.fields[0];
  if (card.values[fieldIds[0]] !== vat.options[1].id || card.values[fieldIds[1]] !== '2026-08-31' || !/Debtors/.test(card.values[fieldIds[2]] || '')) p.errors.push(`card values wrong: ${JSON.stringify(card.values)}`);
  // Clicking the selected option again clears it.
  await page.locator('.segmented button', { hasText: 'Non-VAT' }).click();
  await page.waitForTimeout(300);
  if (store.cards.c1.values[fieldIds[0]] !== undefined) p.errors.push('choice did not clear');
  await page.locator('.segmented button', { hasText: 'VAT' }).first().click();
  await page.waitForTimeout(300);
  // Visible fields: None hides everything, Board default restores.
  await page.locator('button', { hasText: 'Visible fields' }).click();
  await page.locator('.track button', { hasText: 'None' }).click();
  await page.waitForTimeout(300);
  if (!/No fields are shown/.test(await page.locator('#tab-body').textContent())) p.errors.push('None did not hide fields');
  await page.locator('.track label', { hasText: 'VAT Status' }).locator('input').check();
  await page.waitForTimeout(300);
  if (JSON.stringify(store.cards.c1.visible) !== JSON.stringify([fieldIds[0]])) p.errors.push(`visible list wrong: ${JSON.stringify(store.cards.c1.visible)}`);
  await page.locator('.track button', { hasText: 'Board default' }).click();
  await page.waitForTimeout(300);
  if (store.cards.c1.visible !== null) p.errors.push('board default not restored');
  await page.locator('button', { hasText: 'Visible fields' }).click();
  await shot(page, 'fields-card');
  console.log('  card values:', JSON.stringify(store.cards.c1.values).slice(0, 90));
  await done(p, 'fields: card tab');
}
{ // Badges from the connector.
  const p = await fieldsPage('/index.html');
  const badges = await p.page.evaluate(async () => { const t = window.__makeT(); return (await window.__caps['card-badges'](t)).map((b) => `${b.text}/${b.color || ''}`); });
  if (!badges.includes('VAT/green')) p.errors.push(`VAT badge missing: ${badges.join(' | ')}`);
  console.log('  badges:', badges.join(' | '));
  await done(p, 'fields: card-front badge');
}
{ // Board table, sort and CSV.
  store.cards.c2 = { values: { [store.boards.b1.fields[1].id]: '2026-03-31' }, visible: null };
  const p = await fieldsPage('/views/fields-board.html');
  const { page } = p;
  await page.locator('tbody tr').first().waitFor();
  const rows = await page.locator('tbody tr').count();
  await page.locator('th', { hasText: 'Year end' }).click();
  const first = await page.locator('tbody tr').first().locator('td').first().textContent();
  if (rows !== 2 || !/Beta/.test(first)) p.errors.push(`table wrong: ${rows} rows, first after sort ${first}`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('button', { hasText: 'Export CSV' }).click()]);
  const csv = (await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));
  if (!/"Card","List","Card link","VAT Status","Year end","Accounts Schedules Things to Check"/.test(csv) || !/August 2026 sales missing/.test(csv)) p.errors.push(`csv wrong: ${csv.slice(0, 200)}`);
  await shot(page, 'fields-table');
  console.log('  table rows:', rows, '· csv bytes:', csv.length);
  await done(p, 'fields: board table + CSV');
}
{ // Without authorisation the tab asks for it instead of failing.
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/views/card-back.html`, { waitUntil: 'networkidle' });
  await page.locator('.tabs button', { hasText: 'Fields' }).click();
  await page.locator('#tab-body button', { hasText: 'Authorise' }).waitFor();
  await done({ page, errors }, 'fields: asks to authorise');
}

for (const path of ['/views/fields-board.html', '/views/relationships.html', '/views/schedule.html', '/views/schedule.html?mode=temp', '/views/list-filter.html?listId=l1&listName=To%20do', '/views/settings.html', '/views/authorize.html', '/views/oauth-callback.html', '/views/crm-board.html', '/views/routines.html', '/views/bulk.html', '/views/audit.html']) {
  await visit(path, true);
}

await browser.close();
server.kill();
if (problems.length) { console.error('\nProblems:\n' + problems.join('\n')); process.exit(1); }
console.log('\nAll pages loaded without JavaScript errors.');
