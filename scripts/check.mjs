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
// Every field type from the gallery: the worker accepts the definition and a sample value,
// and Keel can format, sort and badge it.
{
  const W = await import('../worker/src/fields.js');
  const FS = await import('../public/js/lib/field-styles.js');
  const FL = await import('../public/js/lib/fields.js');
  // Client and worker agree on style and format ids.
  assert.deepEqual(Object.keys(FS.PROGRESS_STYLES), W.PROGRESS_STYLES, 'progress styles in step');
  assert.deepEqual(Object.keys(FS.RATING_STYLES), W.RATING_STYLES, 'rating styles in step');
  assert.deepEqual(Object.keys(FS.TOGGLE_STYLES), W.TOGGLE_STYLES, 'toggle styles in step');
  assert.deepEqual(Object.keys(FS.DURATION_FORMATS), W.DURATION_FORMATS, 'duration formats in step');
  for (const k of Object.keys(FS.NUMBER_FORMATS)) assert.ok(W.NUMBER_FORMAT_IDS.includes(k), `number format ${k} known to worker`);
  assert.deepEqual(Object.fromEntries(Object.entries(FS.DATE_FORMATS).map(([k, d]) => [k, d.kind])), W.DATE_FORMAT_KINDS, 'date formats in step');
  assert.deepEqual(Object.keys(FL.TYPES).sort(), [...W.FIELD_TYPES].sort(), 'field types in step');

  const groups = {};
  for (const tpl of FL.TEMPLATES) groups[tpl.group] = (groups[tpl.group] || 0) + 1;
  assert.deepEqual(groups, { Basic: 10, Examples: 16, Advanced: 3, 'Progress Bars': 13, Ratings: 19, Toggles: 14, Numbers: 8, Dates: 29, Practice: 8 }, 'gallery matches the Amazing Fields catalogue');

  const made = FL.TEMPLATES.map((tpl) => ({ tpl, field: FL.fromTemplate(tpl) }));
  const clean = W.sanitizeFields(made.map((m) => m.field));
  assert.equal(clean.length, made.length);
  const ctx = { members: [FL.SAMPLE_MEMBER], cards: new Map([[FL.SAMPLE_CARD.id, FL.SAMPLE_CARD], ['c'.repeat(24), { id: 'c'.repeat(24), name: 'Acme', idShort: 7, dateLastActivity: '2026-11-20T10:00:00.000Z', badges: { checkItems: 4, checkItemsChecked: 3 } }]]), checklists: null };
  made.forEach(({ tpl, field }, i) => {
    const f = clean[i];
    if (W.isLayout(f)) return;
    if (W.isComputed(f)) {
      const v = FL.computedValue(f, 'c'.repeat(24), ctx);
      if (f.type === 'cardid') assert.equal(v, `${f.prefix}7`);
      if (f.type === 'checklist') assert.deepEqual(v, { done: 3, total: 4 });
      if (f.type === 'carddate') assert.equal(v, '2026-11-20T10:00:00.000Z');
      assert.throws(() => W.sanitizeValue(f, 'x'), /does not hold a value/);
      assert.ok(FL.formatValue(f, v, { short: true, ctx }).length, `${tpl.name} formats`);
      return;
    }
    const sample = FL.sampleValue(tpl, field);
    if (FL.isEmpty(sample)) return;
    const stored = W.sanitizeValue(f, sample);
    assert.notEqual(stored, null, `${tpl.group} / ${tpl.name}: sample value accepted`);
    const text = FL.formatValue(f, stored, { short: true, ctx });
    assert.ok(typeof text === 'string' && (text.length || f.type === 'checkbox'), `${tpl.group} / ${tpl.name}: formatted "${text}"`);
    FL.sortValue(f, stored);
    FL.badgesFor([{ ...f, badge: true, shown: true }], { values: { [f.id]: stored } }, { ctx, cardId: 'c'.repeat(24) });
  });

  // Styles render.
  assert.equal(FS.progressText('blockShade', 70), '███████░░░');
  assert.equal(FS.progressText('custom', 50, { cells: 4, filled: '🔵', empty: '⚪' }), '🔵🔵⚪⚪');
  assert.equal(FS.progressText('circles', 55), '●●●●●◐○○○○');
  assert.equal(FS.progressText('smooth', 100), '██████████');
  assert.equal(FS.progressText('smooth', 0), '          ');
  for (const k of Object.keys(FS.PROGRESS_STYLES)) for (const v of [0, 7, 33, 50, 99, 100]) assert.equal([...FS.progressText(k, v, { filled: '🔵', empty: '⚪' })].length, 10, `${k} ${v}% is 10 cells`);
  assert.equal(FS.ratingText('hearts', 3, 5), '♥♥♥♡♡');
  assert.equal(FS.ratingText('moons', 2, 4), '🌕🌕🌑🌑');
  // Numbers.
  const n = (format, v, extra = {}) => FS.formatNumberValue({ format, decimals: 2, ...extra }, v);
  assert.equal(n('standard', 1234.567), '1,234.57');
  assert.equal(n('nogroup', 1234.567), '1234.57');
  assert.equal(n('scientific', 1234.57), '1.23E3');
  assert.equal(n('engineering', 12345.6), '12.35E3');
  assert.equal(n('currency', 1234.5, { currency: 'GBP' }), '£1,234.50');
  assert.equal(n('currency', 1234.5, { currency: 'EUR' }), '€1,234.50');
  assert.equal(n('accounting', -1234.56, { currency: 'GBP' }), '(£1,234.56)');
  assert.equal(n('percent01', 0.72), '72%');
  assert.equal(n('percent100', 72), '72%');
  assert.equal(n('gbp', 10), '£10.00', 'older "gbp" fields still format');
  assert.equal(FS.scaleColor({ type: 'number', scale: true, low: 33, high: 66 }, 20), 'red');
  assert.equal(FS.scaleColor({ type: 'number', scale: true, low: 33, high: 66 }, 50), 'yellow');
  assert.equal(FS.scaleColor({ type: 'number', scale: true, low: 33, high: 66 }, 90), 'green');
  assert.equal(FS.scaleColor({ type: 'number', format: 'percent01', scale: true }, 0.9), 'green');
  assert.equal(FS.scaleColor({ type: 'number', scale: true, invert: true }, 90), 'red');
  // Dates: every format renders a value of its kind.
  for (const [k, d] of Object.entries(FS.DATE_FORMATS)) {
    const v = d.kind === 'time' ? '09:30' : d.kind === 'datetime' ? new Date(1983, 9, 14, 9, 30).toISOString() : '1983-10-14';
    const out = FS.formatDateValue({ format: k }, v);
    assert.ok(out && !/Invalid/.test(out), `${k} -> ${out}`);
    if (d.kind !== 'time') assert.ok(out.includes('83'), `${k} shows the year: ${out}`);
    if (d.kind !== 'date') assert.ok(/9|09/.test(out), `${k} shows the time: ${out}`);
  }
  assert.equal(FS.formatDateValue({ format: 'dateShort' }, '1983-10-14'), '14/10/1983');
  assert.equal(FS.formatDateValue({ format: 'dateHuge' }, '1983-10-14'), 'Friday, 14 October 1983');
  assert.equal(FS.formatDateValue({ format: 'yearOnly' }, '1983-10-14'), '1983');
  assert.equal(FS.formatDateValue({ format: 'time24' }, '09:30'), '09:30');
  // Worker date kinds.
  assert.equal(W.sanitizeValue({ name: 'T', type: 'date', format: 'time24' }, '09:30'), '09:30');
  assert.throws(() => W.sanitizeValue({ name: 'T', type: 'date', format: 'time24' }, '1983-10-14'));
  assert.equal(W.sanitizeValue({ name: 'D', type: 'date', format: 'datetimeFull' }, '1983-10-14T09:30:00.000+01:00'), '1983-10-14T08:30:00.000Z');
  assert.throws(() => W.sanitizeValue({ name: 'D', type: 'date', format: 'datetimeFull' }, '1983-10-14'));
  // Deadline warning days.
  const inDays = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  assert.equal(FS.dateColor({ warnDays: 7 }, inDays(3), () => 'x'), 'orange');
  assert.equal(FS.dateColor({ warnDays: 7 }, inDays(0), () => 'x'), 'red');
  assert.equal(FS.dateColor({ warnDays: 7 }, inDays(20), () => 'x'), 'green');
  assert.equal(FS.dateColor({}, inDays(20), () => 'default'), 'default');
  // Durations.
  for (const [s, m] of [['1:30', 90], ['1h 30m', 90], ['90m', 90], ['1.5h', 90], ['90', 90], ['2h', 120], ['45 mins', 45]]) assert.equal(FS.parseDuration(s), m, s);
  assert.equal(FS.parseDuration('soon'), null);
  assert.equal(FS.formatDuration({ format: 'clock' }, 90), '01:30');
  assert.equal(FS.formatDuration({ format: 'words' }, 90), '1h 30m');
  assert.equal(FS.formatDuration({ format: 'decimal' }, 90), '1.5 h');
  // Members and card references.
  const m = { id: 'm', name: 'Owner', type: 'member', multiple: false };
  assert.throws(() => W.sanitizeValue(m, ['a'.repeat(24), 'b'.repeat(24)]), /takes one/);
  assert.deepEqual(W.sanitizeValue({ ...m, multiple: true }, ['a'.repeat(24), 'b'.repeat(24), 'a'.repeat(24)]), ['a'.repeat(24), 'b'.repeat(24)]);
  assert.throws(() => W.sanitizeValue({ ...m, type: 'cardref' }, ['nope']));
  assert.equal(FL.formatValue({ type: 'member' }, [FL.SAMPLE_MEMBER.id], { ctx }), 'Ada Lovelace');
  // Checklist progress by name.
  const lists = { ...ctx, checklists: new Map([['c'.repeat(24), [{ name: 'Year end', done: 1, total: 2 }, { name: 'VAT', done: 2, total: 2 }]]]) };
  assert.deepEqual(FL.computedValue({ type: 'checklist', checklist: 'vat' }, 'c'.repeat(24), lists), { done: 2, total: 2 });
  assert.deepEqual(FL.computedValue({ type: 'checklist', checklist: '' }, 'c'.repeat(24), lists), { done: 3, total: 4 });
  assert.equal(FL.computedValue({ type: 'checklist', checklist: 'payroll' }, 'c'.repeat(24), lists), null);
  assert.equal(FL.createdAt('5f8d0d55b54764421b7156c3').slice(0, 10), '2020-10-19');
}
{ // Every icon a button refers to exists, in each colour, and buttons do not share icons.
  const { readFileSync, existsSync } = await import('node:fs');
  const used = [];
  for (const f of ['audit', 'bulk', 'crm', 'fields', 'relationships', 'routines', 'scheduler']) {
    const src = readFileSync(`public/js/features/${f}.js`, 'utf8');
    for (const m of src.matchAll(/(boardIcon|cardIcon)\('([a-z-]+)'\)/g)) used.push([m[1], m[2]]);
  }
  assert.equal(used.length, 9, 'five board buttons and four card buttons have icons');
  assert.equal(new Set(used.map(([, n]) => n)).size, used.length, 'each button has its own icon');
  for (const [kind, name] of used) for (const v of kind === 'boardIcon' ? ['dark', 'light'] : ['gray']) assert.ok(existsSync(`public/img/icons/${name}-${v}.svg`), `${name}-${v}.svg exists`);
}
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
