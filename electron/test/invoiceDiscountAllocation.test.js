const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/db/database');
const { createAuthService } = require('../src/auth/authService');
const parties = require('../src/services/partyService');
const inventory = require('../src/services/inventoryService');
const accounting = require('../src/services/accountingService');
const invoices = require('../src/services/invoiceService');

let tmpDir;
let db;
let userId;
let customerId;
let supplierId;
let productId;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-disc-'));
  db = openDatabase(tmpDir).db;
  const owner = await createAuthService(db).setupOwner('w', { username: 'owner', displayName: 'المالك', password: 'owner-pass-1' });
  userId = owner.id;
  customerId = parties.createParty(db, userId, { name: 'عميل', type: 'customer' }).id;
  supplierId = parties.createParty(db, userId, { name: 'مورد', type: 'supplier' }).id;
  productId = inventory.createProduct(db, userId, { name: 'علف مركز', unit: 'كيس' }).id;
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const stockValue = () => db.prepare('SELECT total_value AS v FROM products WHERE id = ?').get(productId).v;
const inventoryGl = () => accounting.generalLedger(db, { accountId: 'acc_inventory' }).closing;

test('purchase invoice discount reduces the inventory ledger and stock value by the same amount', () => {
  invoices.createInvoice(db, userId, {
    docType: 'purchase', date: '2024-01-05', partyId: supplierId, paymentMethod: 'credit', discount: 2000,
    items: [{ productId, quantity: 2, unitPrice: 8000, discount: 0 }],
  });
  assert.equal(stockValue(), 14000);
  assert.equal(inventoryGl(), 14000);
  assert.equal(accounting.trialBalance(db).isBalanced, true);
});

test('purchase return on a discounted invoice credits the supplier at the net price paid', () => {
  const inv = invoices.createInvoice(db, userId, {
    docType: 'purchase', date: '2024-01-05', partyId: supplierId, paymentMethod: 'credit', discount: 2000,
    items: [{ productId, quantity: 2, unitPrice: 8000, discount: 0 }],
  });
  const ret = invoices.createReturn(db, userId, {
    returnType: 'purchase_return', invoiceId: inv.id, date: '2024-01-06',
    items: [{ productId, quantity: 1 }],
  });
  assert.equal(ret.total, 7000);
  assert.equal(stockValue(), 7000);
  assert.equal(inventoryGl(), 7000);
  assert.equal(accounting.trialBalance(db).isBalanced, true);
});

test('sales return on a discounted invoice reverses receivable at the net price charged', () => {
  inventory.receiveStock(db, { date: '2024-01-01', productId, quantityMilli: 10000, totalCost: 50000, userId });
  const inv = invoices.createInvoice(db, userId, {
    docType: 'sales', date: '2024-02-01', partyId: customerId, paymentMethod: 'credit', discount: 2000,
    items: [{ productId, quantity: 2, unitPrice: 8000, discount: 0 }],
  });
  const ret = invoices.createReturn(db, userId, {
    returnType: 'sales_return', invoiceId: inv.id, date: '2024-02-02',
    items: [{ productId, quantity: 2 }],
  });
  assert.equal(ret.total, 14000);
  assert.equal(accounting.generalLedger(db, { accountId: 'acc_ar' }).closing, 0);
  assert.equal(accounting.trialBalance(db).isBalanced, true);
});
