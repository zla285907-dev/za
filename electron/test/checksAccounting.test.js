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
let customerId;
let supplierId;
let cashboxId;
let cashAccountId;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-checks-'));
  db = openDatabase(tmpDir).db;
  const owner = await createAuthService(db).setupOwner('w', { username: 'owner', displayName: 'المالك', password: 'owner-pass-1' });
  userId = owner.id;
  customerId = parties.createParty(db, userId, { name: 'عميل', type: 'customer' }).id;
  supplierId = parties.createParty(db, userId, { name: 'مورد', type: 'supplier' }).id;
  cashboxId = treasury.createCashbox(db, userId, { name: 'خزينة', openingBalance: 0, date: '2024-01-01' }).id;
  cashAccountId = treasury.listCashboxes(db).find((b) => b.id === cashboxId).account_id;
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const accountNet = (accountId) => db.prepare(`
  SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) AS net FROM journal_lines WHERE account_id = ?
`).get(accountId).net;

const partyBalance = (partyId) => parties.listParties(db, {}).find((p) => p.id === partyId).balance;
const cashBalance = () => treasury.listCashboxes(db).find((b) => b.id === cashboxId).balance;
const statusOf = (checkId) => treasury.listChecks(db).find((c) => c.id === checkId).status;

const createIncoming = (amount = 3000) => treasury.createCheck(db, userId, {
  direction: 'incoming', amount, dueDate: '2024-04-01', issueDate: '2024-03-01', checkNumber: '88', partyId: customerId,
});
const createOutgoing = (amount = 4000) => treasury.createCheck(db, userId, {
  direction: 'outgoing', amount, dueDate: '2024-05-01', issueDate: '2024-03-02', checkNumber: '19', partyId: supplierId,
});

test('a received customer check debits the checks receivable and credits customer receivables', () => {
  const check = createIncoming(3000);
  assert.equal(accountNet('acc_checks_recv'), 3000);
  assert.equal(accountNet('acc_ar'), -3000);
  assert.equal(partyBalance(customerId), -3000);
  assert.equal(statusOf(check.id), 'received');
  assert.equal(cashBalance(), 0);
});

test('collecting a customer check moves the amount from checks receivable into the cashbox', () => {
  const check = createIncoming(3000);
  treasury.updateCheckStatus(db, userId, check.id, 'collected', { cashboxId, date: '2024-04-02' });
  assert.equal(accountNet('acc_checks_recv'), 0);
  assert.equal(accountNet('acc_ar'), -3000);
  assert.equal(cashBalance(), 3000);
  assert.equal(accountNet(cashAccountId), 3000);
  assert.equal(partyBalance(customerId), -3000);
  assert.equal(statusOf(check.id), 'collected');
});

test('a bounced customer check reverses the receipt and restores the customer balance', () => {
  const check = createIncoming(3000);
  treasury.updateCheckStatus(db, userId, check.id, 'returned', { date: '2024-04-02' });
  assert.equal(accountNet('acc_checks_recv'), 0);
  assert.equal(accountNet('acc_ar'), 0);
  assert.equal(partyBalance(customerId), 0);
  assert.equal(cashBalance(), 0);
  assert.equal(statusOf(check.id), 'returned');
});

test('cancelling a received customer check reverses the receipt the same way', () => {
  const check = createIncoming(3000);
  treasury.updateCheckStatus(db, userId, check.id, 'cancelled', { date: '2024-04-02' });
  assert.equal(accountNet('acc_checks_recv'), 0);
  assert.equal(accountNet('acc_ar'), 0);
  assert.equal(partyBalance(customerId), 0);
  assert.equal(statusOf(check.id), 'cancelled');
});

test('an issued supplier check debits payables and credits checks payable', () => {
  const check = createOutgoing(4000);
  assert.equal(accountNet('acc_ap'), 4000);
  assert.equal(accountNet('acc_checks_pay'), -4000);
  assert.equal(partyBalance(supplierId), 4000);
  assert.equal(statusOf(check.id), 'issued');
});

test('paying an issued supplier check debits checks payable and credits the cashbox', () => {
  const check = createOutgoing(4000);
  treasury.updateCheckStatus(db, userId, check.id, 'paid', { cashboxId, date: '2024-05-01' });
  assert.equal(accountNet('acc_checks_pay'), 0);
  assert.equal(accountNet('acc_ap'), 4000);
  assert.equal(cashBalance(), -4000);
  assert.equal(partyBalance(supplierId), 4000);
  assert.equal(statusOf(check.id), 'paid');
});

test('cancelling an issued supplier check reverses the issue', () => {
  const check = createOutgoing(4000);
  treasury.updateCheckStatus(db, userId, check.id, 'cancelled', { date: '2024-04-10' });
  assert.equal(accountNet('acc_ap'), 0);
  assert.equal(accountNet('acc_checks_pay'), 0);
  assert.equal(partyBalance(supplierId), 0);
  assert.equal(statusOf(check.id), 'cancelled');
});

test('every check journal entry is balanced', () => {
  const incoming = createIncoming(3000);
  createOutgoing(4000);
  treasury.updateCheckStatus(db, userId, incoming.id, 'collected', { cashboxId, date: '2024-04-02' });
  const entries = db.prepare("SELECT COUNT(*) AS n FROM journal_entries WHERE reference_type LIKE 'check\\_%' ESCAPE '\\'").get().n;
  assert.equal(entries, 3);
  const unbalanced = db.prepare(`
    SELECT e.id FROM journal_entries e JOIN journal_lines l ON l.entry_id = e.id
    WHERE e.reference_type LIKE 'check\\_%' ESCAPE '\\' GROUP BY e.id HAVING SUM(l.debit) <> SUM(l.credit)
  `).all();
  assert.equal(unbalanced.length, 0);
});

test('a collection without a cashbox is refused and leaves the check and ledgers unchanged', () => {
  const check = createIncoming(3000);
  assert.throws(() => treasury.updateCheckStatus(db, userId, check.id, 'collected', { date: '2024-04-02' }),
    (e) => e instanceof UserFacingError);
  assert.equal(statusOf(check.id), 'received');
  assert.equal(accountNet('acc_checks_recv'), 3000);
  assert.equal(cashBalance(), 0);
});

test('a check cannot be settled twice or bounced after collection', () => {
  const check = createIncoming(3000);
  treasury.updateCheckStatus(db, userId, check.id, 'collected', { cashboxId, date: '2024-04-02' });
  assert.throws(() => treasury.updateCheckStatus(db, userId, check.id, 'collected', { cashboxId, date: '2024-04-03' }),
    (e) => e instanceof UserFacingError);
  assert.throws(() => treasury.updateCheckStatus(db, userId, check.id, 'returned', { date: '2024-04-03' }),
    (e) => e instanceof UserFacingError);
  assert.equal(cashBalance(), 3000);
  assert.equal(accountNet('acc_checks_recv'), 0);
});

test('a check without a party is refused so the control accounts stay attributable', () => {
  assert.throws(() => treasury.createCheck(db, userId, { direction: 'incoming', amount: 500, dueDate: '2024-04-01' }),
    (e) => e instanceof UserFacingError);
  assert.equal(accountNet('acc_checks_recv'), 0);
});
