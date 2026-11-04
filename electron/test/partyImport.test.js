const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/db/database');
const { createAuthService } = require('../src/auth/authService');
const { UserFacingError } = require('../src/errors');
const parties = require('../src/services/partyService');
const importService = require('../src/services/importService');

let tmpDir;
let db;
let userId;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-import-'));
  db = openDatabase(tmpDir).db;
  const owner = await createAuthService(db).setupOwner('w', { username: 'owner', displayName: 'المالك', password: 'owner-pass-1' });
  userId = owner.id;
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const partyCount = () => db.prepare('SELECT COUNT(*) AS n FROM parties').get().n;

test('CSV parsing handles quoted commas, escaped quotes, CRLF and a BOM', () => {
  const rows = importService.parseCsv('\uFEFF"محل ""الأمل"", القاهرة",عميل,0100\r\nسعيد,مورد,\r\n');
  assert.deepEqual(rows.map((r) => r.cells), [['محل "الأمل", القاهرة', 'عميل', '0100'], ['سعيد', 'مورد', '']]);
});

test('an unclosed quote is refused with a clear message', () => {
  assert.throws(() => importService.parseCsv('"abc,def'), (e) => e instanceof UserFacingError);
});

test('preview classifies rows into ready, duplicates and errors without writing anything', () => {
  parties.createParty(db, userId, { name: 'أحمد علي', type: 'customer' });
  const csv = [
    'name,type,phone',
    'محمد حسن,عميل,0101234567',
    'أحمد علي,عميل,',
    'سوق الجملة,مورد,',
    'سوق الجملة,مورد,',
    ',عميل,',
    'تاجر,موزع,',
    'مورد جديد,مورد,abc',
  ].join('\n');
  const before = partyCount();
  const plan = importService.planPartyImport(db, csv);
  assert.deepEqual(plan.ready.map((r) => r.name), ['محمد حسن', 'سوق الجملة']);
  assert.deepEqual(plan.duplicates.map((r) => r.name), ['أحمد علي', 'سوق الجملة']);
  assert.equal(plan.errors.length, 3);
  assert.equal(partyCount(), before);
});

test('a row with a blank type defaults to customer, and the same name with a different type is not a duplicate', () => {
  parties.createParty(db, userId, { name: 'عبد الله', type: 'supplier' });
  const plan = importService.planPartyImport(db, 'عبد الله,,\n');
  assert.equal(plan.ready.length, 1);
  assert.equal(plan.ready[0].type, 'customer');
  assert.equal(plan.duplicates.length, 0);
});

test('commit imports every ready row in one step and reports how many were skipped as duplicates', () => {
  parties.createParty(db, userId, { name: 'أحمد علي', type: 'customer' });
  const result = importService.commitPartyImport(db, userId, 'محمد حسن,عميل,\nأحمد علي,عميل,\nسوق الجملة,مورد,0120000000\n');
  assert.deepEqual(result, { imported: 2, skipped: 1 });
  assert.equal(partyCount(), 3);
});

test('commit with any invalid row writes nothing at all', () => {
  const before = partyCount();
  assert.throws(() => importService.commitPartyImport(db, userId, 'محمد حسن,عميل,\n,عميل,\n'),
    (e) => e instanceof UserFacingError);
  assert.equal(partyCount(), before);
});

test('an empty file and a file over the row limit are refused', () => {
  assert.throws(() => importService.planPartyImport(db, '  \n'), (e) => e instanceof UserFacingError);
  const big = Array.from({ length: 2001 }, (_, i) => `عميل ${i},عميل,`).join('\n');
  assert.throws(() => importService.planPartyImport(db, big), (e) => e instanceof UserFacingError);
});
