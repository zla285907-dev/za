const { UserFacingError } = require('../errors');
const { audit, nowIso } = require('../domain/audit');
const { assertIsoDate } = require('../domain/money');

const OWNER_ONLY_CATEGORIES = new Set(['security', 'users']);

function cleanText(value, label, max, { required = false } = {}) {
  const text = String(value ?? '').trim();
  if (required && !text) throw new UserFacingError(`${label} مطلوب`);
  if (text.length > max) throw new UserFacingError(`${label} يجب ألا يتجاوز ${max} حرفًا`);
  return text;
}

const EDITABLE_SETTINGS = {
  farm_name: (v) => cleanText(v, 'اسم المزرعة', 120, { required: true }),
  farm_phone: (v) => cleanText(v, 'هاتف المزرعة', 30),
  farm_address: (v) => cleanText(v, 'عنوان المزرعة', 200),
  currency: (v) => cleanText(v, 'العملة', 10, { required: true }),
  fiscal_year_start: (v) => {
    const text = cleanText(v, 'بداية السنة المالية', 5, { required: true });
    if (!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(text)) throw new UserFacingError('بداية السنة المالية يجب أن تكون بصيغة شهر-يوم مثل 01-01');
    return text;
  },
  system_start_date: (v) => {
    const text = cleanText(v, 'تاريخ بداية استخدام النظام', 10);
    return text ? assertIsoDate(text, 'تاريخ بداية استخدام النظام') : '';
  },
  default_cashbox_name: (v) => cleanText(v, 'اسم الخزينة الافتراضية', 60, { required: true }),
  stock_alert_threshold: (v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 100000) throw new UserFacingError('حد التنبيه للمخزون يجب أن يكون رقمًا صحيحًا بين 0 و 100000');
    return String(n);
  },
};

function isOwner(db, userId) {
  return db.prepare('SELECT role_id FROM users WHERE id = ?').get(userId)?.role_id === 'owner';
}

function listSettings(db, userId) {
  const owner = isOwner(db, userId);
  return db.prepare('SELECT key, value, label, category, updated_at FROM app_settings ORDER BY category, key').all()
    .filter((row) => owner || !OWNER_ONLY_CATEGORIES.has(row.category));
}

function updateSettings(db, userId, items) {
  if (!Array.isArray(items) || items.length === 0) throw new UserFacingError('لا توجد إعدادات للحفظ');
  const current = new Map(
    db.prepare('SELECT key, value, label, category FROM app_settings').all().map((row) => [row.key, row]),
  );
  const changes = [];
  for (const item of items) {
    const key = String(item?.key ?? '');
    const setting = current.get(key);
    if (!setting) throw new UserFacingError('إعداد غير معروف');
    const validate = EDITABLE_SETTINGS[key];
    const locked = OWNER_ONLY_CATEGORIES.has(setting.category) || !validate;
    if (locked) {
      if (String(item.value ?? '') === setting.value) continue;
      throw new UserFacingError('هذا الإعداد لا يمكن تعديله من هذه الشاشة');
    }
    const value = validate(item.value);
    if (value !== setting.value) changes.push({ key, label: setting.label, from: setting.value, to: value });
  }
  if (changes.length === 0) return listSettings(db, userId);

  const now = nowIso();
  db.transaction(() => {
    const update = db.prepare('UPDATE app_settings SET value = ?, updated_at = ?, updated_by = ? WHERE key = ?');
    for (const change of changes) update.run(change.to, now, userId, change.key);
    audit(db, {
      userId,
      action: 'update',
      module: 'settings',
      entityType: 'app_settings',
      details: { changes: changes.map(({ key, label, from, to }) => ({ key, label, from, to })) },
    });
  })();
  return listSettings(db, userId);
}

module.exports = { listSettings, updateSettings };
