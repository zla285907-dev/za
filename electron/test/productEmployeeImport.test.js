const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/db/database');
const { createAuthService } = require('../src/auth/authService');
const { UserFacingError } = require('../src/errors');
const importService = require('../src/services/importService');
const inventory = require('../src/services/inventoryService');
const payroll = require('../src/services/payrollService');

let tmpDir;
let db;
let userId;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-import-pe-'));
  db = openDatabase(tmpDir).db;
  const owner = await createAuthService(db).setupOwner('w', { username: 'owner', displayName: 'المالك', password: 'owner-pass-1' });
  userId = owner.id;
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const productCount = () => db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
const employeeCount = () => db.prepare('SELECT COUNT(*) AS n FROM employees').get().n;

test('product preview classifies ready, duplicate and error rows without writing', () => {
  inventory.createProduct(db, userId, { name: 'علف دواجن', category: 'feed', unit: 'كيس', sku: 'F-1' });
  const csv = [
    'name,category,unit,sku,reorder_level',
    'بذور قمح,feed,كيس,SEED-1,5',
    'علف دواجن,feed,كيس,,',
    'مبيد,medication,لتر,,',
    'مضخة,unknown,قطعة,,',
    'مخصب,other,كيلو,F-1,',
  ].join('\n');
  const plan = importService.planProductImport(db, csv);
  assert.deepEqual(plan.ready.map((r) => r.name), ['بذور قمح', 'مبيد']);
  assert.deepEqual(plan.duplicates.map((r) => r.line), [3, 6]);
  assert.equal(plan.errors.length, 1);
  assert.equal(plan.errors[0].line, 5);
  assert.equal(productCount(), 1);
});

test('product commit imports ready rows with zero stock and no opening balance', () => {
  const csv = 'name,category,unit\nبذور قمح,feed,كيس\nمبيد,medication,لتر\n';
  const result = importService.commitProductImport(db, userId, csv);
  assert.deepEqual(result, { imported: 2, skipped: 0 });
  const rows = db.prepare('SELECT name, quantity_milli, total_value, account_id FROM products ORDER BY name').all();
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.quantity_milli, 0);
    assert.equal(row.total_value, 0);
    assert.equal(row.account_id, 'acc_inventory');
  }
});

test('product commit with one bad row imports nothing', () => {
  const csv = 'name,category,unit\nبذور قمح,feed,كيس\nمضخة,unknown,قطعة\n';
  assert.throws(() => importService.commitProductImport(db, userId, csv), (e) => e instanceof UserFacingError);
  assert.equal(productCount(), 0);
});

test('product commit refuses a SKU already used in the file as a duplicate, not a partial write', () => {
  const csv = 'name,category,unit,sku\nأ,feed,كيس,S-9\nب,feed,كيس,S-9\n';
  const result = importService.commitProductImport(db, userId, csv);
  assert.deepEqual(result, { imported: 1, skipped: 1 });
  assert.equal(productCount(), 1);
});

test('employee preview flags missing names, unsupported pay types and existing names', () => {
  payroll.createEmployee(db, userId, { name: 'محمد حسن', baseSalary: 1000 });
  const csv = [
    'name,phone,job_title,salary_type,base_salary,hire_date',
    'سعيد عبد الله,0100000001,راعي,daily,50,2026-01-05',
    'محمد حسن,,,monthly,1000,',
    ',,,monthly,0,',
    'خالد,,,hourly,20,',
    'منى,,,monthly,abc,',
  ].join('\n');
  const plan = importService.planEmployeeImport(db, csv);
  assert.deepEqual(plan.ready.map((r) => r.name), ['سعيد عبد الله']);
  assert.deepEqual(plan.duplicates.map((r) => r.line), [3]);
  assert.deepEqual(plan.errors.map((r) => r.line), [4, 5, 6]);
  assert.equal(employeeCount(), 1);
});

test('employee commit creates monthly employees by default and keeps the hire date', () => {
  const csv = 'name,phone,job_title,salary_type,base_salary,hire_date\nسعيد,,راعي,,80000,2026-02-01\n';
  const result = importService.commitEmployeeImport(db, userId, csv);
  assert.deepEqual(result, { imported: 1, skipped: 0 });
  const row = db.prepare('SELECT salary_type, base_salary, hire_date, job_title FROM employees').get();
  assert.equal(row.salary_type, 'monthly');
  assert.equal(row.base_salary, 80000);
  assert.equal(row.hire_date, '2026-02-01');
  assert.equal(row.job_title, 'راعي');
});

test('employee commit with one bad row imports nothing', () => {
  const csv = 'name,phone,job_title,salary_type,base_salary\nسعيد,,,monthly,800\nخالد,,,hourly,20\n';
  assert.throws(() => importService.commitEmployeeImport(db, userId, csv), (e) => e instanceof UserFacingError);
  assert.equal(employeeCount(), 0);
});
