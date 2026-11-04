const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/db/database');
const { createAuthService } = require('../src/auth/authService');
const treasury = require('../src/services/treasuryService');
const { runAudit } = require('../src/services/treasuryAuditService');

let tmpDir;
let db;
let userId;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-treasury-audit-'));
  db = openDatabase(tmpDir).db;
  const owner = await createAuthService(db).setupOwner('w', { username: 'owner', displayName: 'المالك', password: 'owner-pass-1' });
  userId = owner.id;
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const insertTx = (cashboxId, overrides) => treasury.insertCashTransaction(db, {
  docNumber: overrides.docNumber,
  date: '2024-02-01',
  type: overrides.type,
  direction: overrides.direction,
  cashboxId,
  amount: overrides.amount,
  sourceType: overrides.sourceType ?? null,
  sourceId: overrides.sourceId ?? null,
  description: overrides.description ?? null,
  journalEntryId: null,
  userId,
});

test('opening balance is counted once and matches the linked account', () => {
  const box = treasury.createCashbox(db, userId, { name: 'خزينة افتتاحية', openingBalance: 5000, date: '2024-01-01' });
  const row = runAudit(db).cashboxes.find((c) => c.cashboxId === box.id);
  assert.equal(row.openingBalance, 5000);
  assert.equal(row.computedBalance, 5000);
  assert.equal(row.balanceColumn, 5000);
  assert.equal(row.cashboxVsAccountDiff, 0);
});

test('cashbox computed balance applies receipts and payments once', () => {
  const box = treasury.createCashbox(db, userId, { name: 'خزينة حركات', openingBalance: 1000, date: '2024-01-01' });
  insertTx(box.id, { docNumber: 'AUD-IN-1', type: 'receipt', direction: 'in', amount: 300 });
  insertTx(box.id, { docNumber: 'AUD-OUT-1', type: 'payment', direction: 'out', amount: 100 });
  const row = runAudit(db).cashboxes.find((c) => c.cashboxId === box.id);
  assert.equal(row.computedBalance, 1200);
  assert.equal(row.transactionCount, 2);
  assert.equal(row.unlinkedCount, 2);
});

test('main cashbox links to account 101 and additional cashboxes link to separate subaccounts', () => {
  const main = db.prepare("SELECT id FROM cashboxes WHERE id = 'cashbox_main'").get();
  const a = treasury.createCashbox(db, userId, { name: 'فرع أ', openingBalance: 2000, date: '2024-01-01' });
  const b = treasury.createCashbox(db, userId, { name: 'فرع ب', openingBalance: 3000, date: '2024-01-01' });

  const report = runAudit(db);
  const rowMain = report.cashboxes.find((c) => c.cashboxId === main.id);
  const rowA = report.cashboxes.find((c) => c.cashboxId === a.id);
  const rowB = report.cashboxes.find((c) => c.cashboxId === b.id);

  assert.equal(rowMain.accountCode, '101');
  assert.notEqual(rowA.accountId, 'acc_cash');
  assert.notEqual(rowB.accountId, 'acc_cash');
  assert.notEqual(rowA.accountId, rowB.accountId);
  assert.notEqual(rowA.accountCode, rowB.accountCode);
  assert.equal(db.prepare('SELECT parent_id FROM accounts WHERE id = ?').get(rowA.accountId).parent_id, 'acc_cash');
  assert.equal(db.prepare('SELECT parent_id FROM accounts WHERE id = ?').get(rowB.accountId).parent_id, 'acc_cash');
});

test('each cashbox is compared only with its own linked account and totals use distinct accounts', () => {
  const a = treasury.createCashbox(db, userId, { name: 'فرع ج', openingBalance: 2000, date: '2024-01-01' });
  const b = treasury.createCashbox(db, userId, { name: 'فرع د', openingBalance: 4000, date: '2024-01-01' });
  insertTx(a.id, { docNumber: 'AUD-A-OUT', type: 'payment', direction: 'out', amount: 500 });

  const report = runAudit(db);
  const rowA = report.cashboxes.find((c) => c.cashboxId === a.id);
  const rowB = report.cashboxes.find((c) => c.cashboxId === b.id);
  assert.equal(rowA.cashboxVsAccountDiff, -500);
  assert.equal(rowB.cashboxVsAccountDiff, 0);

  const accountIds = report.accounts.map((acc) => acc.accountId);
  assert.equal(new Set(accountIds).size, accountIds.length, 'no account is listed twice');
  assert.equal(report.totalAccountBalance, report.accounts.reduce((s, acc) => s + acc.journalBalance, 0));
  assert.equal(report.totalCashboxBalance, report.cashboxes.reduce((s, c) => s + c.balanceColumn, 0));
  assert.equal(report.totalDifference, report.totalCashboxBalance - report.totalAccountBalance);
  assert.equal(report.totalDifference, -500);
});

test('transfer is detected from source metadata and flagged when amounts differ', () => {
  const from = treasury.createCashbox(db, userId, { name: 'خزينة مصدر', openingBalance: 2000, date: '2024-01-01' });
  const to = treasury.createCashbox(db, userId, { name: 'خزينة وجهة', openingBalance: 0, date: '2024-01-01' });
  insertTx(from.id, { docNumber: 'AUD-TRW-1', type: 'withdrawal', direction: 'out', amount: 500, sourceType: 'cash_transfer', sourceId: 'TR-1' });
  insertTx(to.id, { docNumber: 'AUD-TRD-1', type: 'deposit', direction: 'in', amount: 450, sourceType: 'cash_transfer', sourceId: 'TR-1' });

  const report = runAudit(db);
  assert.equal(report.transfers.length, 1);
  assert.equal(report.transfers[0].fromCashboxId, from.id);
  assert.equal(report.transfers[0].toCashboxId, to.id);
  assert.equal(report.transfers[0].consistent, false);
  assert.equal(report.unlinkedTransactions.length, 2);
});

test('transfers without source metadata are not reported as transfers', () => {
  const from = treasury.createCashbox(db, userId, { name: 'خزينة أ', openingBalance: 0, date: '2024-01-01' });
  const to = treasury.createCashbox(db, userId, { name: 'خزينة ب', openingBalance: 0, date: '2024-01-01' });
  insertTx(from.id, { docNumber: 'AUD-NOSRC-OUT', type: 'withdrawal', direction: 'out', amount: 50 });
  insertTx(to.id, { docNumber: 'AUD-NOSRC-IN', type: 'deposit', direction: 'in', amount: 50 });
  assert.equal(runAudit(db).transfers.length, 0);
});

test('audit is read-only and leaves balances and transactions unchanged', () => {
  const box = treasury.createCashbox(db, userId, { name: 'خزينة قراءة', openingBalance: 700, date: '2024-01-01' });
  insertTx(box.id, { docNumber: 'AUD-RO-1', type: 'receipt', direction: 'in', amount: 100 });
  const countBefore = db.prepare('SELECT COUNT(*) AS n FROM cash_transactions').get().n;
  const balanceBefore = treasury.listCashboxes(db).find((b) => b.id === box.id).balance;

  runAudit(db);
  runAudit(db);

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cash_transactions').get().n, countBefore);
  assert.equal(treasury.listCashboxes(db).find((b) => b.id === box.id).balance, balanceBefore);
});
