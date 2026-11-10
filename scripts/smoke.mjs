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
      sizeTo: async () => {}, signUrl: (u) => u, popup: async () => {}, modal: async () => {}, closePopup: async () => {}, closeModal: async () => {},
      showCard: async () => {}, alert: () => {},
      getOAuth2ApiClient: () => ({ getAccessToken: async () => null, authorize: async () => {}, redirectUriCallback: async () => {} })
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
        if (name === 'list-sorters') { const s = await fn(t); out[name] = await s[0].callback(t, { cards: await t.cards() }); }
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
for (const path of ['/views/relationships.html', '/views/schedule.html', '/views/schedule.html?mode=temp', '/views/list-filter.html?listId=l1&listName=To%20do', '/views/settings.html', '/views/authorize.html', '/views/oauth-callback.html', '/views/crm-board.html', '/views/routines.html', '/views/bulk.html', '/views/audit.html']) {
  await visit(path, true);
}

await browser.close();
server.kill();
if (problems.length) { console.error('\nProblems:\n' + problems.join('\n')); process.exit(1); }
console.log('\nAll pages loaded without JavaScript errors.');
