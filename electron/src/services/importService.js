const { UserFacingError } = require('../errors');
const { createParty } = require('./partyService');

const MAX_ROWS = 2000;
const TYPE_ALIASES = { customer: 'customer', عميل: 'customer', supplier: 'supplier', مورد: 'supplier' };
const HEADER_NAMES = new Set(['name', 'الاسم']);
const PHONE_PATTERN = /^[0-9+\-\s]{6,20}$/;

function parseCsv(text) {
  const source = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (quoted) throw new UserFacingError('ملف CSV غير سليم: توجد علامة اقتباس غير مغلقة');
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows
    .map((cells, index) => ({ cells, line: index + 1 }))
    .filter((entry) => entry.cells.some((cell) => cell.trim() !== ''));
}

function duplicateKey(name, type) {
  return `${name.trim().toLowerCase()}|${type}`;
}

function planPartyImport(db, csvText) {
  if (typeof csvText !== 'string' || csvText.trim() === '') throw new UserFacingError('الملف فارغ');
  let entries = parseCsv(csvText);
  if (entries.length > 0 && HEADER_NAMES.has((entries[0].cells[0] ?? '').trim().toLowerCase())) entries = entries.slice(1);
  if (entries.length === 0) throw new UserFacingError('لا توجد صفوف للاستيراد');
  if (entries.length > MAX_ROWS) throw new UserFacingError(`الحد الأقصى ${MAX_ROWS} صفًا في الملف الواحد`);

  const existing = new Set(db.prepare('SELECT name, type FROM parties').all().map((p) => duplicateKey(p.name, p.type)));
  const seen = new Set();
  const plan = { ready: [], duplicates: [], errors: [] };

  for (const { cells, line } of entries) {
    const name = (cells[0] ?? '').trim();
    const typeText = (cells[1] ?? '').trim().toLowerCase();
    const phone = (cells[2] ?? '').trim();
    const problems = [];
    if (!name) problems.push('الاسم مطلوب');
    else if (name.length > 120) problems.push('الاسم أطول من 120 حرفًا');
    const type = typeText === '' ? 'customer' : TYPE_ALIASES[typeText];
    if (!type) problems.push('النوع يجب أن يكون عميل أو مورد');
    if (phone && !PHONE_PATTERN.test(phone)) problems.push('رقم الهاتف غير صالح');
    if (problems.length > 0) {
      plan.errors.push({ line, message: problems.join('، ') });
      continue;
    }
    const key = duplicateKey(name, type);
    if (existing.has(key) || seen.has(key)) {
      plan.duplicates.push({ line, name, type });
      continue;
    }
    seen.add(key);
    plan.ready.push({ line, name, type, phone: phone || null });
  }
  return plan;
}

function commitPartyImport(db, userId, csvText) {
  return db.transaction(() => {
    const plan = planPartyImport(db, csvText);
    if (plan.errors.length > 0) {
      throw new UserFacingError(`لم يُستورد أي صف لوجود ${plan.errors.length} صف به أخطاء. صحّح الملف وأعد المحاولة`);
    }
    for (const row of plan.ready) {
      createParty(db, userId, { name: row.name, type: row.type, phone: row.phone });
    }
    return { imported: plan.ready.length, skipped: plan.duplicates.length };
  })();
}

module.exports = { parseCsv, planPartyImport, commitPartyImport };
