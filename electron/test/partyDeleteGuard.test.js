const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/db/database');
const { createAuthService } = require('../src/auth/authService');
const { UserFacingError } = require('../src/errors');
const parties = require('../src/services/partyService');
const treasury = require('../src/services/treasuryService');

let tmpDir;
let db;
let userId;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-party-del-'));
  db = openDatabase(tmpDir).db;
  const owner = await createAuthService(db).setupOwner('w', { username: 'owner', displayName: 'المالك', password: 'owner-pass-1' });
  userId = owner.id;
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('a party that only has a check cannot be deleted', () => {
  const partyId = parties.createParty(db, userId, { name: 'عميل شيكات', type: 'customer' }).id;
  treasury.createCheck(db, userId, { direction: 'incoming', amount: 5000, dueDate: '2024-03-01', partyId });
  assert.throws(() => parties.deleteParty(db, userId, partyId), UserFacingError);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM parties WHERE id = ?').get(partyId).n, 1);
});

test('a party that only has a financial transfer cannot be deleted', () => {
  const partyId = parties.createParty(db, userId, { name: 'عميل تحويلات', type: 'customer' }).id;
  treasury.createTransfer(db, userId, { direction: 'inbound', amount: 3000, date: '2024-03-02', partyId });
  assert.throws(() => parties.deleteParty(db, userId, partyId), UserFacingError);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM parties WHERE id = ?').get(partyId).n, 1);
});

test('a party with no activity can still be deleted', () => {
  const partyId = parties.createParty(db, userId, { name: 'طرف فارغ', type: 'supplier' }).id;
  parties.deleteParty(db, userId, partyId);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM parties WHERE id = ?').get(partyId).n, 0);
});
