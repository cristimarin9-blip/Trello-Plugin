// Parses every JS module in public/ and worker/ and runs the pure unit checks.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js') || p.endsWith('.mjs')) out.push(p);
  }
  return out;
}

const files = [...walk('public/js'), ...walk('worker/src')];
let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) { failed += 1; console.error(`✗ ${file}\n${r.stderr}`); } else console.log(`✓ ${file}`);
}

// Pure-logic unit checks (no Trello needed).
const { daysUntil, addMonths, monthsFromEnd, deadlineColor } = await import('../public/js/lib/util.js');
const { numberItems, depthOf, withDepth } = await import('../public/js/tabs/checklist.js');
const { normaliseNumber, toSnapshot, looksLikeCompanyNumber } = await import('../public/js/tabs/company.js');
const { shapeCompany, shapeSearch } = await import('../worker/src/index.js');
const { TRACKS } = await import('../public/js/features/crm.js');

assert.equal(addMonths('2025-03-31', 9, 1), '2026-01-01');
assert.equal(addMonths('2025-01-31', 1), '2025-02-28');
assert.equal(TRACKS.vat.deadline('2025-03-31'), '2025-05-07');
assert.equal(monthsFromEnd('2025-06-30', 9), '2026-03-31');
assert.equal(monthsFromEnd('2025-06-30', 9, 1), '2026-04-01');
assert.equal(monthsFromEnd('2025-03-31', 9, 1), '2026-01-01');
assert.equal(monthsFromEnd('2025-06-15', 9), '2026-03-15');
assert.equal(TRACKS.accounts.deadline('2025-06-30'), '2026-03-31');
assert.equal(TRACKS.vat.deadline('2025-06-30'), '2025-08-07');
assert.equal(TRACKS.paye.deadline('2025-06-30'), '2025-07-22');
assert.equal(deadlineColor('2000-01-01'), 'red');
assert.ok(daysUntil('2000-01-01') < 0);
assert.deepEqual(numberItems([{ depth: 0 }, { depth: 1 }, { depth: 1 }, { depth: 0 }, { depth: 1 }, { depth: 2 }]), ['1', '1.1', '1.2', '2', '2.1', '2.1.1']);
assert.deepEqual(depthOf('↳ ↳ Reconcile bank'), { depth: 2, text: 'Reconcile bank' });
assert.equal(withDepth('x', 2), '↳ ↳ x');
assert.equal(normaliseNumber(' 1234567 '), '01234567');
assert.equal(normaliseNumber('sc123456'), 'SC123456');
const shaped = shapeCompany({
  company_number: '00000006', company_name: 'TEST LTD', company_status: 'active', type: 'ltd', date_of_creation: '2010-01-01',
  registered_office_address: { address_line_1: '1 Street', locality: 'Town', postal_code: 'AB1 2CD' },
  accounts: { next_due: '2026-03-31', next_made_up_to: '2025-06-30', overdue: false, accounting_reference_date: { day: '30', month: '06' } },
  confirmation_statement: { next_due: '2026-02-14', next_made_up_to: '2026-01-31' }
}, { items: [{ name: 'DOE, Jane', officer_role: 'director', appointed_on: '2010-01-01' }, { name: 'OLD, Bob', officer_role: 'director', resigned_on: '2015-01-01' }] });
assert.equal(shaped.officers.length, 1);
assert.equal(shaped.accounts.ard, '30/06');
const snap = toSnapshot(shaped);
assert.equal(snap.ctPaymentDue, '2026-04-01');
assert.equal(snap.ctReturnDue, '2026-06-30');
assert.ok(JSON.stringify(snap).length < 1200, 'snapshot stays small');
for (const n of ['00000006', '6', ' 1234 5678 ', 'SC123456', 'sc123456', 'NI012345', 'OC301234', 'R0123456']) assert.ok(looksLikeCompanyNumber(n), `${n} is a company number`);
for (const n of ['Acme Ltd', 'acme', '3M', 'BT', '123456789', 'SC12345', 'ABC12345', '']) assert.ok(!looksLikeCompanyNumber(n), `${n} is a name`);
const found = shapeSearch({ items: [
  { company_number: '00000006', title: 'TEST LTD', company_status: 'active', company_type: 'ltd', date_of_creation: '2010-01-01', address_snippet: '1 Street, Town, AB1 2CD' },
  { company_number: 'SC000001', title: 'OLD LTD', company_status: 'dissolved', address: { address_line_1: '2 Road', locality: 'Glasgow' } },
  { title: 'NO NUMBER' }
] });
assert.equal(found.length, 2, 'items without a company number are dropped');
assert.deepEqual(found[0], { number: '00000006', name: 'TEST LTD', status: 'active', type: 'ltd', incorporated: '2010-01-01', ceased: null, address: '1 Street, Town, AB1 2CD' });
assert.equal(found[1].address, '2 Road, Glasgow');
assert.deepEqual(shapeSearch({}), []);
assert.deepEqual(shapeSearch(null), []);
const { formatValue, badgesFor, visibleFields, csvCell } = await import('../public/js/lib/fields.js');
const notesField = { id: 'n', name: 'Check', type: 'notes' };
assert.equal(formatValue(notesField, 'Debtors\n- Sales missing\n- Wages', { short: true }), 'Debtors · Sales missing · Wages');
const vatField = { id: 'v', name: 'VAT', type: 'choice', badge: true, options: [{ id: 'y', label: 'VAT', color: 'green' }] };
const yeField = { id: 'd', name: 'Year end', type: 'date', badge: true, shown: false };
assert.deepEqual(visibleFields([vatField, yeField, notesField], null).map((f) => f.id), ['v', 'n'], 'board default uses "shown"');
assert.deepEqual(visibleFields([vatField, yeField, notesField], ['d']).map((f) => f.id), ['d']);
assert.deepEqual(badgesFor([vatField, yeField], { values: { v: 'y', d: '2000-01-01' }, visible: null }), [{ text: 'VAT', color: 'green' }], 'hidden fields give no badge');
assert.equal(badgesFor([vatField, yeField], { values: { v: 'y', d: '2000-01-01' }, visible: ['d'] })[0].color, 'red');
assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`, 'CSV formula injection is neutralised');
assert.equal(csvCell('a "b"'), '"a ""b"""');
const { shownBadges } = await import('../public/js/lib/deadline-badges.js');
assert.equal(shownBadges({}).accounts, true);
assert.equal(shownBadges({}).ctReturn, false, 'CT600 is off by default');
assert.equal(shownBadges({ stageBadges: false }).crm_vat, false, 'old switch still respected');
assert.equal(shownBadges({ stageBadges: false, cardBadges: { crm_vat: true } }).crm_vat, true, 'explicit choice wins');
assert.equal(shownBadges({ cardBadges: { accounts: false, bogus: true } }).accounts, false);
assert.equal(shownBadges({ cardBadges: { bogus: true } }).bogus, undefined);
const { fromTemplate, TEMPLATES, sampleValue, formatNumber, isLayout: isLayoutField } = await import('../public/js/lib/fields.js');
for (const tpl of TEMPLATES) {
  const f = fromTemplate(tpl);
  assert.ok(f.id && f.name && f.type, `template ${tpl.name} makes a field`);
  if (!isLayoutField(f)) sampleValue(tpl, f);
}
assert.equal(formatNumber({ format: 'gbp', decimals: 2 }, 1500), '£1,500.00');
assert.equal(formatNumber({ format: 'percent', decimals: 0 }, 72), '72%');
assert.equal(formatValue({ type: 'multi', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }, ['b', 'a']), 'B, A');
assert.equal(formatValue({ type: 'rating', max: 5 }, 3, { short: true }), '★★★☆☆');
assert.deepEqual(badgesFor([{ id: 'r', name: 'Docs', type: 'text', badge: true, required: true, shown: true }], { values: {}, visible: null }), [{ text: 'Docs: missing', color: 'red' }]);
assert.deepEqual(badgesFor([{ id: 'c', name: 'VAT', type: 'choice', badge: true, badgeName: true, shown: true, options: [{ id: 'y', label: 'Yes', color: 'green' }] }], { values: { c: 'y' } }), [{ text: 'VAT: Yes', color: 'green' }]);
const { resolve, builtInDefaults, FEATURE_IDS } = await import('../public/js/lib/features.js');
const d = builtInDefaults();
assert.ok(FEATURE_IDS.every((id) => d[id] === true));
assert.equal(resolve(d, { company: false }).company, false);
assert.equal(resolve(d, { company: false }).priority, true);
assert.equal(resolve({ ...d, crm: false }, null).crm, false);
assert.equal(resolve({ ...d, crm: false }, { crm: true }).crm, true);
assert.equal(resolve(d, { company: 'nope' }).company, true, 'non-boolean overrides are ignored');
console.log('✓ unit checks passed');

if (failed) { console.error(`${failed} file(s) failed to parse`); process.exit(1); }
