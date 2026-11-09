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
const { normaliseNumber, toSnapshot } = await import('../public/js/tabs/company.js');
const { shapeCompany } = await import('../worker/src/index.js');
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
