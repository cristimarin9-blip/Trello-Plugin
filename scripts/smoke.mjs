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
    { id: 'c1', name: 'Acme Ltd — year end', idList: 'l1', idShort: 7, dueComplete: false, labels: [{ id: 'lb1', name: 'VAT', color: 'green' }], members: [], due: '2026-12-01T17:00:00.000Z', dateLastActivity: '2026-11-20T10:00:00.000Z', badges: { checkItems: 4, checkItemsChecked: 3 } },
    { id: 'c2', name: 'Beta Ltd — bookkeeping', idList: 'l2', idShort: 8, dueComplete: true, labels: [], members: [], dateLastActivity: '2026-11-19T10:00:00.000Z', badges: { checkItems: 0, checkItemsChecked: 0 } }
  ];
  function makeT() {
    return {
      get: async (scope, vis, key, def) => (key in bucket(scope) ? bucket(scope)[key] : def),
      set: async (scope, vis, key, val) => { bucket(scope)[key] = val; },
      remove: async (scope, vis, key) => { delete bucket(scope)[key]; },
      getAll: async () => data,
      card: async () => ({ ...cardsList[0] }),
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

await visit('/views/card-back.html', true, async (page, errors) => {
  const count = await page.locator('.tabs button.tab').count();
  for (let i = 0; i < count; i += 1) {
    await page.locator('.tabs button.tab').nth(i).click();
    await page.waitForTimeout(300);
    const label = await page.locator('.tabs button.tab').nth(i).textContent();
    const body = (await page.locator('#tab-body').textContent()).trim().replace(/\s+/g, ' ').slice(0, 70);
    console.log(`  tab ${label}: ${body}`);
  }
  // Several tabs at once: toggle mode, pick three, switch layout, remember it, go back to one.
  await page.locator('.tab-tool', { hasText: 'Several tabs' }).click();
  await page.locator('.tabs button.tab', { hasText: 'Company' }).click();
  await page.locator('.tabs button.tab', { hasText: 'Client stages' }).click();
  await page.locator('.tabs button.tab', { hasText: 'Subtasks' }).click();
  await page.waitForTimeout(300);
  const panels = await page.locator('#tab-body .panel > header span').allTextContents();
  console.log(`  several tabs: ${panels.join(' | ')}`);
  if (panels.length < 3 || !panels.includes('Company') || !panels.includes('Client stages') || !panels.includes('Subtasks')) errors.push(`several tabs not shown: ${panels.join(', ')}`);
  if (!(await page.locator('#tab-body.panels.stack').count())) errors.push('panels should be stacked');
  if (process.env.SHOTS) { await page.setViewportSize({ width: 760, height: 900 }); await page.screenshot({ path: `${process.env.SHOTS}/card-several.png`, fullPage: true }); }
  if (await page.locator('.tab-tool', { hasText: /Side by side|Stack/ }).count()) errors.push('there should be no side-by-side layout any more');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('keel:card-panels')));
  if (!saved.several || saved.open.length < 3) errors.push(`panel choice not remembered: ${JSON.stringify(saved)}`);
  await page.locator('button[aria-label="Hide Subtasks"]').click();
  await page.waitForTimeout(200);
  if (await page.locator('.panel > header', { hasText: 'Subtasks' }).count()) errors.push('× did not hide the panel');
  await page.locator('.tab-tool', { hasText: 'One tab' }).click();
  await page.waitForTimeout(200);
  if (await page.locator('#tab-body .panel').count()) errors.push('one-tab mode still shows panels');
  // Ctrl-click adds a panel straight away.
  await page.locator('.tabs button.tab', { hasText: 'Who viewed' }).click({ modifiers: ['Control'] });
  await page.waitForTimeout(200);
  if ((await page.locator('#tab-body .panel').count()) !== 2) errors.push('Ctrl-click should add a second panel');
  await page.evaluate(() => localStorage.removeItem('keel:card-panels'));
  await page.locator('.tab-tool', { hasText: 'One tab' }).click();
  // Client stages: changing the stage records today's date; the date can be typed key by key
  // (every digit kept) and must be 2020 or later; the period end comes from the card title.
  await page.locator('.tabs button.tab', { hasText: 'Client stages' }).click();
  await page.waitForTimeout(300);
  if (await page.locator('input[aria-label="VAT return period end"]').count()) errors.push('the period end box should be gone');
  if (!/Period end: .*saved earlier/.test(await page.locator('#tab-body').textContent())) errors.push('should explain where the period end comes from');
  await page.locator('select[aria-label="VAT return stage"]').selectOption('Review');
  await page.waitForTimeout(300);
  const todayIso = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  let crmNow = await page.evaluate(() => window.__makeT().get('card', 'shared', 'crm'));
  if (crmNow.vat.stage !== 'Review' || crmNow.vat.changed !== todayIso) errors.push(`stage change not dated: ${JSON.stringify(crmNow.vat)}`);
  if ((await page.locator('input[aria-label="VAT return stage changed"]').inputValue()) !== todayIso) errors.push('stage changed box should show today');
  await page.locator('.track', { hasText: 'VAT return' }).locator('button', { hasText: 'Next stage' }).click();
  await page.waitForTimeout(300);
  crmNow = await page.evaluate(() => window.__makeT().get('card', 'shared', 'crm'));
  if (crmNow.vat.stage !== 'Sent for approval') errors.push(`Next stage did not move on: ${crmNow.vat.stage}`);
  const changedBox = page.locator('input[aria-label="VAT return stage changed"]');
  if ((await changedBox.getAttribute('min')) !== '2020-01-01') errors.push('stage changed date should not allow dates before 2020');
  await changedBox.focus();
  for (const k of '09302026') { await page.keyboard.type(k); await page.waitForTimeout(80); }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  crmNow = await page.evaluate(() => window.__makeT().get('card', 'shared', 'crm'));
  console.log(`  stage changed typed key by key: ${crmNow.vat.changed}`);
  if (crmNow.vat.changed !== '2026-09-30') errors.push(`typing the year lost digits: saved ${crmNow.vat.changed}`);
  const box2 = page.locator('input[aria-label="VAT return stage changed"]');
  await box2.fill('2019-03-31');
  await box2.press('Enter');
  await page.waitForTimeout(400);
  crmNow = await page.evaluate(() => window.__makeT().get('card', 'shared', 'crm'));
  if (crmNow.vat.changed !== '2026-09-30') errors.push(`a 2019 date should be refused, saved ${crmNow.vat.changed}`);
  // Leaving a half-typed date keeps the saved one.
  const box3 = page.locator('input[aria-label="VAT return stage changed"]');
  await box3.focus();
  await page.keyboard.type('0');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  crmNow = await page.evaluate(() => window.__makeT().get('card', 'shared', 'crm'));
  if (crmNow.vat.changed !== '2026-09-30') errors.push(`a half-typed date should not clear the saved one, saved ${crmNow.vat.changed}`);
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

// --- Fields: set up, fill in, visible fields, badges, table, views, CSV ----------
const store = { boards: {}, cards: {}, views: [] };
await context.route('https://trello-companies-house-proxy.kabooom.workers.dev/fields/**', async (route) => {
  const req = route.request();
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, PATCH, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Accept, Content-Type, Authorization' };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  const reply = (status, body) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
  if (req.headers().authorization !== 'Bearer test-token') return reply(401, { error: 'Authorise Keel first' });
  const [, kind, id, sub] = new URL(req.url()).pathname.match(/^\/fields\/(board|card)\/([^/]+)(?:\/(views|sample))?/);
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  const boardOf = () => store.boards.b1 || { fields: [], updatedAt: 0 };
  if (sub === 'views') { store.views = body.views; return reply(200, { views: store.views }); }
  if (kind === 'board' && req.method() === 'GET') return reply(200, { ...boardOf(), views: store.views, cards: store.cards });
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
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  return { page, errors };
}
// SHOTS=dir npm run smoke  saves screenshots of the Fields pages.
const shot = (page, name) => (process.env.SHOTS ? page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }) : null);
const done = async ({ page, errors }, label) => { errors.forEach((e) => problems.push(`${label}: ${e}`)); console.log(`${errors.length ? '✗' : '✓'} ${label}`); await page.close(); };
const fieldNames = () => (store.boards.b1 ? store.boards.b1.fields : []).map((f) => f.name);

{ // Card with no fields yet offers set-up, and the button opens a page that exists.
  const p = await fieldsPage('/views/card-back.html');
  await p.page.locator('.tabs button', { hasText: 'Fields' }).click();
  await p.page.locator('#tab-body button', { hasText: 'Set up fields' }).click();
  const opened = await p.page.evaluate(async () => { const o = window.__lastModal; const r = await fetch(o.url); return { url: o.url, status: r.status, tab: o.args && o.args.tab }; });
  if (opened.status !== 200 || !opened.url.endsWith('/views/fields-board.html') || opened.tab !== 'manage') p.errors.push(`Set up fields opens a broken page: ${JSON.stringify(opened)}`);
  await done(p, 'fields: empty board offers set-up');
}
{ // Add / edit fields: gallery, rename, options, layout, section tab, reorder, save.
  const p = await fieldsPage('/views/fields-board.html?tab=manage');
  const { page } = p;
  const addFromGallery = async (name) => {
    if (!(await page.locator('.gallery').count())) await page.locator('.fm-side-head button', { hasText: '+ Add' }).click();
    await page.locator(`button[aria-label="Add ${name}"]`).click();
  };
  if (!(await page.locator('.gcard').count())) p.errors.push('gallery not shown for an empty board');
  await page.locator('input[aria-label="Search field types"]').fill('vat');
  if ((await page.locator('.gcard').count()) !== 1) p.errors.push(`gallery search should find 1, found ${await page.locator('.gcard').count()}`);
  await page.locator('input[aria-label="Search field types"]').fill('');
  await shot(page, 'fields-gallery');
  await addFromGallery('VAT status');
  await addFromGallery('Company number');
  await addFromGallery('Year end');
  await page.locator('.kv-row', { hasText: 'Editor width' }).locator('select').selectOption('third');
  await addFromGallery('Section Tab');
  await page.locator('input.fname').fill('Accounts Schedules Things to Check');
  await addFromGallery('Things to check');
  await page.locator('input.fname').fill('Debtors');
  await page.locator('.check-row', { hasText: 'Required' }).locator('input').check();
  await addFromGallery('Rating Field');
  await page.locator('button[aria-label="Move up"]').click();
  // Options editing on VAT.
  await page.locator('.fm-list li', { hasText: 'VAT Status' }).click();
  await page.locator('.check-row', { hasText: 'Show field name on card front' }).locator('input').check();
  if (!/Unsaved/.test(await page.locator('.savebar').textContent())) p.errors.push('unsaved indicator missing');
  if (!(await page.locator('.preview-card .ftabs button', { hasText: 'Accounts Schedules' }).count())) p.errors.push('preview does not show the section tab');
  await shot(page, 'fields-manage');
  await page.locator('.savebar button', { hasText: 'Save fields' }).click();
  await page.waitForTimeout(400);
  const names = fieldNames();
  const expect = ['VAT Status', 'Company Number', 'Year end', 'Accounts Schedules Things to Check', 'Rating', 'Debtors'];
  if (names.join('|') !== expect.join('|')) p.errors.push(`fields not saved as expected: ${names.join('|')}`);
  const saved = Object.fromEntries((store.boards.b1 ? store.boards.b1.fields : []).map((f) => [f.name, f]));
  if (!saved['Year end'] || saved['Year end'].width !== 'third' || !saved.Debtors || !saved.Debtors.required || saved['Accounts Schedules Things to Check'].type !== 'section' || !saved['VAT Status'].badgeName) p.errors.push(`field options not saved: ${JSON.stringify(saved).slice(0, 300)}`);
  if (!/Fields saved/.test(await page.locator('#status').textContent())) p.errors.push('no saved message');
  // An empty name is refused.
  await addFromGallery('Text Field');
  await page.locator('input.fname').fill('');
  await page.locator('.savebar button', { hasText: 'Save fields' }).click();
  if (!/needs a name/.test(await page.locator('#status').textContent())) p.errors.push('empty field name was not refused');
  await page.locator('.savebar button', { hasText: 'Discard' }).click();
  if ((await page.locator('.fm-list li').count()) !== 6) p.errors.push('discard did not restore the saved fields');
  console.log('  fields defined:', names.join(' | '));
  await done(p, 'fields: add / edit');
}
const F = () => Object.fromEntries(store.boards.b1.fields.map((f) => [f.name, f]));
{ // Fill in a card: segment buttons, date, section tab, notes, rating, required, visible fields.
  const p = await fieldsPage('/views/card-back.html');
  const { page } = p;
  await page.locator('.tabs button', { hasText: 'Fields' }).click();
  await page.locator('.segmented button', { hasText: 'Non-VAT' }).click();
  await page.waitForTimeout(200);
  await page.locator('input[aria-label="Year end"]').fill('2026-08-31');
  await page.locator('input[aria-label="Year end"]').press('Enter');
  await page.waitForTimeout(200);
  if (!(await page.locator('.ftabs button', { hasText: 'Accounts Schedules' }).count())) p.errors.push('section tab missing on the card');
  if (!(await page.locator('.fcell.missing', { hasText: 'Debtors' }).count())) p.errors.push('required empty field not marked');
  await page.locator('.fcell', { hasText: 'Debtors' }).locator('.notes-view').click();
  await page.locator('textarea').fill('Debtors:\n- August 2026 sales missing\n- Sales not received?\nCreditors:\n- Wages - 750.80 difference');
  await page.locator('.fcell button', { hasText: 'Save' }).click();
  await page.locator('.notes h4').first().waitFor();
  const heads = await page.locator('.notes h4').allTextContents();
  if (heads.join('|') !== 'Debtors:|Creditors:' || (await page.locator('.notes li').count()) !== 3) p.errors.push(`notes rendered wrong: ${heads}`);
  if (await page.locator('.fcell.missing', { hasText: 'Debtors' }).count()) p.errors.push('required mark not cleared after filling');
  await page.locator('.stars button[aria-label="3 of 5"]').click();
  await page.waitForTimeout(200);
  const f = F();
  const v = store.cards.c1.values;
  if (v[f['VAT Status'].id] !== f['VAT Status'].options[1].id || v[f['Year end'].id] !== '2026-08-31' || v[f.Rating.id] !== 3 || !/Wages/.test(v[f.Debtors.id] || '')) p.errors.push(`card values wrong: ${JSON.stringify(v)}`);
  await page.locator('.segmented button', { hasText: /^VAT$/ }).click();
  await page.waitForTimeout(200);
  await shot(page, 'fields-card');
  // Visible fields picker.
  await page.locator('button', { hasText: 'Visible fields' }).click();
  await page.locator('.picker button', { hasText: 'None' }).click();
  await page.waitForTimeout(200);
  if (!/No fields are shown/.test(await page.locator('#tab-body').textContent())) p.errors.push('None did not hide fields');
  await page.locator('.picker-item', { hasText: 'VAT Status' }).locator('input').check();
  await page.waitForTimeout(200);
  if (JSON.stringify(store.cards.c1.visible) !== JSON.stringify([f['VAT Status'].id])) p.errors.push(`visible list wrong: ${JSON.stringify(store.cards.c1.visible)}`);
  await shot(page, 'fields-picker');
  await page.locator('.picker button', { hasText: 'Board default' }).click();
  await page.waitForTimeout(200);
  if (store.cards.c1.visible !== null) p.errors.push('board default not restored');
  console.log('  card values:', JSON.stringify(store.cards.c1.values).slice(0, 100));
  await done(p, 'fields: card tab');
}
{ // Badges from the connector, and card-front deadline choices from settings.
  const p = await fieldsPage('/index.html');
  const badges = await p.page.evaluate(async () => { const t = window.__makeT(); window.__seed(); return (await window.__caps['card-badges'](t)).map((b) => `${b.text}/${b.color || ''}`); });
  if (!badges.includes('VAT Status: VAT/green')) p.errors.push(`VAT badge missing: ${badges.join(' | ')}`);
  if (!badges.some((b) => b.startsWith('Accounts'))) p.errors.push('Accounts deadline badge missing by default');
  const after = await p.page.evaluate(async () => {
    const t = window.__makeT();
    await t.set('card', 'shared', 'company', { ...(await t.get('card', 'shared', 'company')), ctReturnDue: '2027-03-31' });
    await t.set('board', 'shared', 'settings', { cardBadges: { accounts: false, crm_vat: false, ctReturn: true } });
    const out = (await window.__caps['card-badges'](t)).map((b) => b.text);
    await t.remove('board', 'shared', 'settings');
    return out;
  });
  if (after.some((b) => b.startsWith('Accounts') || b.startsWith('VAT: ')) || !after.some((b) => b.startsWith('CT600'))) p.errors.push(`deadline choices not respected: ${after.join(' | ')}`);
  console.log('  badges:', badges.join(' | '));
  console.log('  with choices:', after.join(' | '));
  await done(p, 'fields: card-front badges + deadline choices');
}
{ // Settings popup saves the deadline choices and keeps other settings.
  const p = await fieldsPage('/views/settings.html');
  const { page } = p;
  await page.evaluate(() => window.__makeT().set('board', 'shared', 'settings', { chProxyUrl: '', custom: 'keep-me' }));
  await page.evaluate(() => window.__render());
  await page.locator('label', { hasText: 'Accounts due' }).locator('input').uncheck();
  await page.locator('label', { hasText: 'CT600 return' }).locator('input').check();
  await page.locator('button', { hasText: 'Save settings' }).click();
  await page.waitForTimeout(200);
  const s = await page.evaluate(() => window.__makeT().get('board', 'shared', 'settings'));
  if (!s || s.cardBadges.accounts !== false || s.cardBadges.ctReturn !== true || s.custom !== 'keep-me') p.errors.push(`settings not saved right: ${JSON.stringify(s)}`);
  await shot(page, 'settings-deadlines');
  await done(p, 'settings: card-front deadlines');
}
{ // Table view: inline edit, sort, filter, group, columns, saved view, CSV.
  const f = F();
  store.cards.c2 = { values: { [f['Year end'].id]: '2026-03-31', [f['Company Number'].id]: '07654321' }, visible: null };
  const p = await fieldsPage('/views/fields-board.html');
  const { page } = p;
  await page.locator('.ftable tbody tr:not(.group-row)').first().waitFor();
  const rows = () => page.locator('.ftable tbody tr:not(.group-row)').count();
  if ((await rows()) !== 2) p.errors.push(`expected 2 rows, got ${await rows()}`);
  // Inline segment edit on Beta.
  const beta = page.locator('.ftable tbody tr', { hasText: 'Beta Ltd' });
  await beta.locator('.segmented button', { hasText: 'Non-VAT' }).click();
  await page.waitForTimeout(200);
  if (store.cards.c2.values[f['VAT Status'].id] !== f['VAT Status'].options[1].id) p.errors.push('inline segment edit not saved');
  // Click-to-edit text cell.
  await beta.locator('td.t-text').click();
  await beta.locator('td.t-text input').fill('01111111');
  await beta.locator('td.t-text input').press('Enter');
  await page.waitForTimeout(300);
  if (store.cards.c2.values[f['Company Number'].id] !== '01111111') p.errors.push(`inline text edit not saved: ${JSON.stringify(store.cards.c2.values)}`);
  // Sort by Year end.
  await page.locator('th', { hasText: 'Year end' }).click();
  const first = await page.locator('.ftable tbody tr:not(.group-row)').first().locator('td').first().textContent();
  if (!/Beta/.test(first)) p.errors.push(`sort wrong, first row ${first}`);
  // Filter VAT Status is VAT.
  await page.locator('.tb', { hasText: 'Filter' }).click();
  await page.locator('.tpanel button', { hasText: '+ Add filter' }).click();
  await page.locator('.tpanel .prow select').nth(2).selectOption({ label: 'VAT' });
  if ((await rows()) !== 1) p.errors.push(`filter should leave 1 row, got ${await rows()}`);
  await page.locator('.tpanel button[aria-label="Remove filter"]').click();
  // Group by VAT Status.
  await page.locator('.tb', { hasText: 'Group by' }).click();
  await page.locator('.tpanel select').selectOption({ label: 'VAT Status' });
  const groups = await page.locator('.group-row').allTextContents();
  if (groups.length !== 2) p.errors.push(`expected 2 groups, got ${groups.join(' / ')}`);
  // Hide a column.
  await page.locator('.tb', { hasText: 'Columns' }).click();
  await page.locator('.col-grid label', { hasText: 'Members' }).locator('input').uncheck();
  if (await page.locator('th', { hasText: 'Members' }).count()) p.errors.push('Members column still shown');
  await shot(page, 'fields-table');
  // Save as a new view.
  await page.locator('.view-tabs button[aria-label="New view"]').click();
  await page.locator('.view-tabs input').fill('VAT clients');
  await page.locator('.view-tabs input').press('Enter');
  await page.waitForTimeout(300);
  if (store.views.length !== 1 || store.views[0].name !== 'VAT clients' || store.views[0].groupBy !== f['VAT Status'].id) p.errors.push(`view not saved: ${JSON.stringify(store.views)}`);
  // CSV.
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.tb', { hasText: 'Export to spreadsheet' }).click()]);
  const csv = await (await import('node:fs/promises')).readFile(await download.path(), 'utf8');
  if (!/"Name","List","VAT Status","Company Number","Year end","Rating","Debtors","Card link"/.test(csv) || !/August 2026 sales missing/.test(csv)) p.errors.push(`csv wrong: ${csv.slice(0, 200)}`);
  console.log('  table rows:', 2, '· groups:', groups.length, '· csv bytes:', csv.length);
  await done(p, 'fields: table view');
}
{ // Every field type from the gallery works on a card, in the table and in the export.
  await context.route('https://api.trello.com/1/boards/*/checklists**', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify([{ idCard: 'c1', name: 'Year end', checkItems: [{ state: 'complete' }, { state: 'incomplete' }] }, { idCard: 'c1', name: 'VAT return', checkItems: [{ state: 'complete' }, { state: 'complete' }] }]) }));
  const setup = await fieldsPage('/views/card-back.html');
  const catalogue = await setup.page.evaluate(async () => {
    const m = await import('/js/lib/fields.js');
    return m.TEMPLATES.map((tpl) => ({ group: tpl.group, name: tpl.name, field: m.fromTemplate(tpl) }));
  });
  await setup.page.close();
  // One checklist field filtered by name, to exercise the Trello checklist lookup.
  catalogue.find((c) => c.field.type === 'checklist').field.checklist = 'VAT';
  store.boards.b1 = { fields: catalogue.map((c) => c.field), updatedAt: Date.now() };
  store.cards = {};
  store.views = [];
  const p = await fieldsPage('/views/card-back.html');
  const { page } = p;
  await page.locator('.tabs button', { hasText: 'Fields' }).click();
  await page.locator('.fcell').first().waitFor();
  const valueFields = catalogue.filter((c) => !['section', 'header'].includes(c.field.type));
  const cells = await page.locator('.fcell').count();
  if (cells !== valueFields.length) p.errors.push(`expected ${valueFields.length} fields on the card, got ${cells}`);
  const failures = [];
  const stored = (id) => (store.cards.c1 ? store.cards.c1.values[id] : undefined);
  const settle = () => page.waitForTimeout(60);
  for (const { group, name, field: f } of valueFields) {
    const cell = page.locator(`.fcell[data-field="${f.id}"]`);
    const label = `${group} / ${name}`;
    try {
      let expect;
      switch (f.type) {
        case 'checkbox': await cell.locator('button.toggle').click(); expect = true; break;
        case 'rating': await cell.locator(`button[aria-label="3 of ${f.max || 5}"]`).click(); expect = 3; break;
        case 'progress': await cell.locator('input[type=range]').fill('40'); await cell.locator('input[type=range]').dispatchEvent('change'); expect = 40; break;
        case 'number': await cell.locator('input[type=number]').fill('12.5'); await cell.locator('input[type=number]').dispatchEvent('change'); expect = 12.5; break;
        case 'duration': await cell.locator('input').fill('1h 30m'); await cell.locator('input').dispatchEvent('change'); expect = 90; break;
        case 'member': await cell.locator('button.chip').first().click(); expect = ['m1']; break;
        case 'cardref': await cell.locator('input[type=search]').fill('beta'); await cell.locator('button.result').first().click(); expect = ['c2']; break;
        case 'choice':
          if (f.display === 'dropdown') await cell.locator('select').selectOption(f.options[1].id);
          else await cell.locator('.segmented button').nth(1).click();
          expect = f.options[1].id; break;
        case 'multi': await cell.locator('button.chip').nth(0).click(); await settle(); await cell.locator('button.chip').nth(1).click(); expect = [f.options[0].id, f.options[1].id]; break;
        case 'text': await cell.locator('input').fill('Hello'); await cell.locator('input').dispatchEvent('change'); expect = 'Hello'; break;
        case 'url': await cell.locator('input').fill('https://example.com/a'); await cell.locator('input').dispatchEvent('change'); expect = 'https://example.com/a'; break;
        case 'email': await cell.locator('input').fill('a@b.co'); await cell.locator('input').dispatchEvent('change'); expect = 'a@b.co'; break;
        case 'phone': await cell.locator('input').fill('020 7946 0000'); await cell.locator('input').dispatchEvent('change'); expect = '020 7946 0000'; break;
        case 'notes': await cell.locator('.notes-view').click(); await cell.locator('textarea').fill('Debtors:\n- one'); await cell.locator('button', { hasText: 'Save' }).click(); expect = 'Debtors:\n- one'; break;
        case 'date': {
          const inp = cell.locator('input');
          const type = await inp.getAttribute('type');
          const inputs = { time: ['10:15', '10:15'], 'datetime-local': ['2026-12-01T10:15', 'iso'], month: ['2026-12', '2026-12-01'], number: ['2027', '2027-01-01'], date: ['2026-12-01', '2026-12-01'] };
          const [raw, want] = inputs[type];
          await inp.fill(raw);
          if (['date', 'datetime-local', 'month'].includes(type)) await inp.press('Enter'); else await inp.dispatchEvent('change');
          expect = want;
          break;
        }
        case 'checklist': { const t = await cell.textContent(); if (!/2\/2/.test(t)) failures.push(`${label}: shows "${t}" (expected VAT checklist 2/2)`); continue; }
        case 'cardid': { const t = await cell.textContent(); if (!t.includes('7')) failures.push(`${label}: shows "${t}"`); continue; }
        case 'carddate': { const t = await cell.textContent(); if (!/20|19|2026|2020|1970/.test(t)) failures.push(`${label}: shows "${t}"`); continue; }
        default: failures.push(`${label}: no test for type ${f.type}`); continue;
      }
      await settle();
      const got = stored(f.id);
      const ok = expect === 'iso' ? typeof got === 'string' && /^2026-12-01T\d\d:15:00\.000Z$/.test(got) : JSON.stringify(got) === JSON.stringify(expect);
      if (!ok) failures.push(`${label}: stored ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`);
      // The value shows back on the card.
      const shown = await cell.textContent();
      if (f.type === 'rating' && !shown.length) failures.push(`${label}: nothing shown`);
    } catch (err) {
      failures.push(`${label}: ${err.message.split('\n')[0]}`);
    }
  }
  failures.forEach((x) => p.errors.push(x));
  await shot(page, 'fields-all-card');
  console.log(`  every field type: ${valueFields.length - failures.length}/${valueFields.length} work on the card`);
  await done(p, 'fields: every gallery type on a card');

  const tp = await fieldsPage('/views/fields-board.html');
  await tp.page.locator('.ftable tbody tr:not(.group-row)').first().waitFor();
  const heads = await tp.page.locator('.ftable thead th').count();
  if (heads !== valueFields.length + 3) tp.errors.push(`expected ${valueFields.length + 3} columns, got ${heads}`);
  const acme = tp.page.locator('.ftable tbody tr', { hasText: 'Acme' });
  for (const want of ['#7', '1h 30m', '01:30', '12.5', '£12.50', '1,250%', '1.25E1', '12.5%', 'Ann Example', 'Beta Ltd', '2/2']) {
    if (!(await acme.textContent()).includes(want)) tp.errors.push(`table row is missing "${want}"`);
  }
  const [download] = await Promise.all([tp.page.waitForEvent('download'), tp.page.locator('.tb', { hasText: 'Export to spreadsheet' }).click()]);
  const csv = await (await import('node:fs/promises')).readFile(await download.path(), 'utf8');
  const header = csv.split('\r\n')[0].split('","').length;
  if (header !== valueFields.length + 4) tp.errors.push(`CSV has ${header} columns, expected ${valueFields.length + 4}`);
  for (const want of ['Ann Example', 'Beta Ltd — bookkeeping', '01:30', '#7', '2/2']) if (!csv.includes(want)) tp.errors.push(`CSV is missing "${want}"`);
  // Sort by a date-time column and a duration column without errors.
  await tp.page.locator('th', { hasText: 'DateTime 24h Huge' }).click();
  await tp.page.locator('th', { hasText: /^⏱Duration/ }).first().click();
  await shot(tp.page, 'fields-all-table');
  await done(tp, 'fields: every gallery type in the table + CSV');

  const gp = await fieldsPage('/views/fields-board.html?tab=manage');
  await gp.page.locator('.fm-side-head button', { hasText: '+ Add' }).click();
  const cards = await gp.page.locator('.gcard').count();
  if (cards !== catalogue.length) gp.errors.push(`gallery shows ${cards} types, expected ${catalogue.length}`);
  const chips = (await gp.page.locator('.filter-chips button').allTextContents()).join(' ');
  for (const want of ['Basic10', 'Examples16', 'Advanced3', 'Progress Bars13', 'Ratings19', 'Toggles14', 'Numbers8', 'Dates29']) if (!chips.includes(want)) gp.errors.push(`gallery group missing: ${want} (${chips})`);
  await shot(gp.page, 'fields-all-gallery');
  // Every type's editor options open without errors.
  const items = await gp.page.locator('.fm-list li').count();
  for (let i = 0; i < items; i += 1) await gp.page.locator('.fm-list li').nth(i).click();
  console.log(`  gallery: ${cards} types · editor opened for ${items} fields`);
  await done(gp, 'fields: gallery + editor for every type');
}

{ // Sign-in runs in a modal that stays open; the callback page explains a lost opener.
  const p = await fieldsPage('/views/settings.html');
  await p.page.evaluate(() => { window.__token = null; return window.__render(); });
  await p.page.locator('button', { hasText: /^Authorise/ }).first().click();
  const opened = await p.page.evaluate(async () => { const o = window.__lastModal; return o ? { url: o.url, status: (await fetch(o.url)).status } : null; });
  if (!opened || !opened.url.endsWith('/views/authorize.html') || opened.status !== 200) p.errors.push(`settings Authorise should open the authorise modal: ${JSON.stringify(opened)}`);
  await done(p, 'auth: settings opens the authorise modal');

  const a = await fieldsPage('/views/authorize.html');
  await a.page.evaluate(() => { window.__token = null; return window.__render(); });
  if ((await a.page.locator('.auth-steps li').count()) !== 3) a.errors.push('authorise steps missing');
  await a.page.locator('button.primary', { hasText: 'Authorise' }).click();
  await a.page.locator('.auth-ok').waitFor();
  await done(a, 'auth: authorise modal completes');

  const c = await fieldsPage('/views/oauth-callback.html?state=somestate&code=x');
  await c.page.waitForTimeout(300);
  const text = await c.page.locator('#app').textContent();
  if (!/Sign-in did not finish/.test(text) || !/Keep|keep/.test(text)) c.errors.push(`callback without an opener should explain what to do: ${text.slice(0, 120)}`);
  await done(c, 'auth: callback explains a closed Keel window');
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
