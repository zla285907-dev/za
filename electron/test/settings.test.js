const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/db/database');
const { createAuthService } = require('../src/auth/authService');
const { ROLE_PERMISSIONS } = require('../src/auth/rolePermissions');
const { listSettings, updateSettings } = require('../src/services/settingsService');

let tmpDir;
let db;
let ownerId;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-settings-'));
  db = openDatabase(tmpDir).db;
  const owner = await createAuthService(db).setupOwner('w', { username: 'owner', displayName: 'المالك', password: 'owner-pass-1' });
  ownerId = owner.id;
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function addUser(id, roleId) {
  db.prepare(`INSERT INTO users (id, username, display_name, password_hash, role_id, is_active, created_at, updated_at)
    VALUES (?, ?, ?, 'x', ?, 1, '2024-01-01', '2024-01-01')`).run(id, id, id, roleId);
  return id;
}

function valueOf(key) {
  return db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key).value;
}

test('the owner sees general settings with their current values', () => {
  const rows = listSettings(db, ownerId);
  const farmName = rows.find((r) => r.key === 'farm_name');
  assert.equal(farmName.value, 'مزرعة المواشي');
  assert.equal(farmName.category, 'general');
});

test('saved general settings are reloaded after the database is reopened', () => {
  updateSettings(db, ownerId, [
    { key: 'farm_name', value: 'مزرعة الواحة' },
    { key: 'stock_alert_threshold', value: '12' },
  ]);
  db.close();
  db = openDatabase(tmpDir).db;
  assert.equal(valueOf('farm_name'), 'مزرعة الواحة');
  assert.equal(valueOf('stock_alert_threshold'), '12');
  assert.equal(valueOf('currency'), 'EGP');
});

test('a change is written to the audit log with the user and the old and new values', () => {
  updateSettings(db, ownerId, [{ key: 'currency', value: 'USD' }]);
  const log = db.prepare("SELECT user_id, action, module, details FROM audit_logs WHERE module = 'settings'").get();
  assert.equal(log.user_id, ownerId);
  assert.equal(log.action, 'update');
  const details = JSON.parse(log.details);
  assert.deepEqual(details.changes, [{ key: 'currency', label: 'العملة', from: 'EGP', to: 'USD' }]);
});

test('unchanged values are saved without writing an audit entry', () => {
  updateSettings(db, ownerId, [{ key: 'currency', value: 'EGP' }, { key: 'farm_logo', value: '' }]);
  const count = db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE module = 'settings'").get().n;
  assert.equal(count, 0);
});

test('an invalid value rejects the whole batch and changes nothing', () => {
  assert.throws(() => updateSettings(db, ownerId, [
    { key: 'farm_name', value: 'اسم جديد' },
    { key: 'stock_alert_threshold', value: 'abc' },
  ]), /حد التنبيه للمخزون/);
  assert.equal(valueOf('farm_name'), 'مزرعة المواشي');
});

test('invalid fiscal start and system start dates are rejected', () => {
  assert.throws(() => updateSettings(db, ownerId, [{ key: 'fiscal_year_start', value: '13-45' }]), /بداية السنة المالية/);
  assert.throws(() => updateSettings(db, ownerId, [{ key: 'system_start_date', value: '2024-02-31' }]));
  assert.equal(valueOf('fiscal_year_start'), '01-01');
});

test('unknown keys are rejected', () => {
  assert.throws(() => updateSettings(db, ownerId, [{ key: 'no_such_key', value: 'x' }]), /إعداد غير معروف/);
});

test('settings that are not editable from the settings screen cannot be changed', () => {
  assert.throws(() => updateSettings(db, ownerId, [{ key: 'valuation_method', value: 'fifo' }]), /لا يمكن تعديله/);
  assert.equal(valueOf('valuation_method'), 'weighted_average');
});

test('security and user settings cannot be changed through the general channel, even by the owner', () => {
  db.prepare("INSERT INTO app_settings (key, value, label, category) VALUES ('login_lock_minutes', '15', 'قفل الدخول', 'security')").run();
  assert.throws(() => updateSettings(db, ownerId, [{ key: 'login_lock_minutes', value: '1' }]), /لا يمكن تعديله/);
  assert.equal(valueOf('login_lock_minutes'), '15');
});

test('non-owners do not receive security settings in the list', () => {
  db.prepare("INSERT INTO app_settings (key, value, label, category) VALUES ('login_lock_minutes', '15', 'قفل الدخول', 'security')").run();
  const managerId = addUser('manager-1', 'manager');
  const keys = listSettings(db, managerId).map((r) => r.key);
  assert.ok(keys.includes('farm_name'));
  assert.ok(!keys.includes('login_lock_minutes'));
});

test('only the owner role has the settings edit permission by default', () => {
  for (const role of Object.keys(ROLE_PERMISSIONS)) {
    assert.equal(ROLE_PERMISSIONS[role].includes('settings.edit'), false, `${role} must not edit settings by default`);
  }
  const ids = db.prepare("SELECT id FROM permissions WHERE id IN ('settings.view', 'settings.edit')").all().map((r) => r.id);
  assert.deepEqual(ids.sort(), ['settings.edit', 'settings.view']);
});

test('a user granted the settings permission can save general settings', () => {
  const managerId = addUser('manager-2', 'manager');
  db.prepare("INSERT INTO user_permissions (user_id, permission_id) VALUES (?, 'settings.edit')").run(managerId);
  updateSettings(db, managerId, [{ key: 'farm_phone', value: '0100000000' }]);
  assert.equal(valueOf('farm_phone'), '0100000000');
  const actor = db.prepare("SELECT user_id FROM audit_logs WHERE module = 'settings'").get();
  assert.equal(actor.user_id, managerId);
});
