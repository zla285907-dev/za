/**
 * اختبارات آلية للمنطق المالي الأساسي
 *
 * تختبر هذه الوحدة الدوال النقية (pure functions) دون الحاجة إلى قاعدة بيانات:
 *  1. تحويل الجنيه إلى قرش وبالعكس (toCents / toEgp)
 *  2. التحقق من توازن القيود المحاسبية (منطق createJournalEntry)
 *  3. حساب المتوسط المرجح لتكلفة المخزون (منطق recordStockMovement)
 *  4. تجميع أرصدة الأطراف (منطق كشف حساب الطرف)
 *  5. ترقيم المستندات (منطق nextDocNumber)
 *  6. صلاحيات الأدوار
 *
 * التشغيل: npx tsx src/lib/finance.test.ts
 */

// نسخة محلية من دوال التحويل (مطابقة لـ src/db/db.ts) لتفادي مشكلة alias في tsx
const CENTS_PER_EGP = 100;
function toCents(egp: number): number {
  return Math.round(egp * CENTS_PER_EGP);
}
function toEgp(cents: number): number {
  return cents / CENTS_PER_EGP;
}

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
    // console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function approx(a: number, b: number, eps = 0.0001): boolean {
  return Math.abs(a - b) < eps;
}

// ===================== 1. تحويل العملة =====================
function testCentsConversion(): void {
  assert(toCents(0) === 0, 'صفر يبقى صفر');
  assert(toCents(1) === 100, 'جنيه واحد = 100 قرش');
  assert(toCents(1.5) === 150, '1.5 جنيه = 150 قرش');
  assert(toCents(0.01) === 1, 'قرش واحد = 1');
  assert(toCents(1234.56) === 123456, '1234.56 جنيه = 123456 قرش');
  assert(toCents(0.005) === 1, 'التقريب: 0.005 → 1 قرش (نصف قرش يُقرب)');
  assert(toCents(0.004) === 0, 'التقريب: 0.004 → 0 قرش');
  assert(toEgp(100) === 1, '100 قرش = 1 جنيه');
  assert(toEgp(123456) === 1234.56, '123456 قرش = 1234.56 جنيه');
  assert(toEgp(toCents(99.99)) === 99.99, 'تحويل ذهاب وإياب يحافظ على القيمة');
  assert(CENTS_PER_EGP === 100, 'ثابت القروش = 100');
}

// ===================== 2. توازن القيود المحاسبية =====================
function testJournalBalance(): void {
  // نفس منطق createJournalEntry في accountingService.ts
  function isBalanced(lines: { debit: number; credit: number }[]): boolean {
    const totalDebit = lines.reduce((s, l) => s + toCents(l.debit), 0);
    const totalCredit = lines.reduce((s, l) => s + toCents(l.credit), 0);
    return totalDebit === totalCredit && totalDebit > 0;
  }

  assert(isBalanced([{ debit: 100, credit: 100 }]), 'قيد متوازن بسيط');
  assert(!isBalanced([{ debit: 100, credit: 50 }]), 'قيد غير متوازن');
  assert(!isBalanced([{ debit: 0, credit: 0 }]), 'قيد بصفر مرفوض');
  assert(
    isBalanced([
      { debit: 1000, credit: 0 },
      { debit: 0, credit: 600 },
      { debit: 0, credit: 400 },
    ]),
    'قيد متعدد الأسطر متوازن'
  );
  assert(
    !isBalanced([
      { debit: 1000, credit: 0 },
      { debit: 0, credit: 999.99 },
    ]),
    'فروق صغيرة جدًا تُكشف (بسبب القروش الصحيحة)'
  );
  // تحقق أن الفاصلة العشرية لا تسبب خطأ تراكمي
  assert(
    isBalanced([
      { debit: 33.33, credit: 0 },
      { debit: 33.33, credit: 0 },
      { debit: 33.34, credit: 0 },
      { debit: 0, credit: 100 },
    ]),
    'مجموع القروش يطابق تمامًا (لا خطأ فاصلة عائمة)'
  );
}

// ===================== 3. المتوسط المرجح =====================
function testWeightedAverage(): void {
  // نفس منطق recordStockMovement في inventoryService.ts
  function weightedAvg(
    oldQty: number,
    oldAvgCostCents: number,
    inQty: number,
    inUnitCostCents: number
  ): number {
    const totalCost = oldQty * oldAvgCostCents + inQty * inUnitCostCents;
    const newQty = oldQty + inQty;
    return newQty > 0 ? totalCost / newQty : oldAvgCostCents;
  }

  // شراء 100 وحدة بـ 10 جنيه
  assert(approx(weightedAvg(0, 0, 100, toCents(10)), toCents(10)), 'أول شراء: المتوسط = سعر الشراء');
  // إضافة 50 وحدة بـ 15 جنيه → (100*1000 + 50*1500) / 150 = 1166.67
  assert(approx(weightedAvg(100, toCents(10), 50, toCents(15)), 1166.6667, 0.5), 'شراء ثاني يرفع المتوسط');
  // إضافة بكمية صفر لا يغير المتوسط
  assert(approx(weightedAvg(100, toCents(10), 0, toCents(20)), toCents(10)), 'كمية صفر لا تغير المتوسط');
  // إضافة بكمية كبيرة تخفّض المتوسط
  assert(weightedAvg(10, toCents(100), 90, toCents(10)) < toCents(100), 'كمية كبيرة بسعر أقل تخفض المتوسط');
}

// ===================== 4. كشف حساب الطرف =====================
function testPartyStatement(): void {
  // محاكاة منطق getPartyStatement في partyService.ts
  interface TxRow { debit: number; credit: number; }
  function computeClosing(openingCents: number, rows: TxRow[]): number {
    let balance = openingCents;
    for (const r of rows) balance += r.debit - r.credit;
    return balance;
  }

  assert(computeClosing(0, []) === 0, 'لا حركات = الرصيد الافتتاحي');
  assert(
    computeClosing(toCents(1000), [{ debit: toCents(500), credit: 0 }]) === toCents(1500),
    'فاتورة مبيعات تزيد رصيد العميل'
  );
  assert(
    computeClosing(toCents(1000), [{ debit: 0, credit: toCents(300) }]) === toCents(700),
    'سداد يقلل رصيد العميل'
  );
  assert(
    computeClosing(0, [
      { debit: toCents(1000), credit: 0 },
      { debit: 0, credit: toCents(400) },
      { debit: toCents(200), credit: 0 },
    ]) === toCents(800),
    'تجميع عدة حركات'
  );
  assert(
    computeClosing(toCents(500), [
      { debit: 0, credit: toCents(500) },
    ]) === 0,
    'سداد كامل يصفّر الرصيد'
  );
}

// ===================== 5. ترقيم المستندات =====================
function testDocumentNumbering(): void {
  // محاكاة منطق nextDocNumber
  function formatDoc(prefix: string, next: number, padding: number): string {
    return `${prefix}-${String(next).padStart(padding, '0')}`;
  }

  assert(formatDoc('JV', 1, 5) === 'JV-00001', 'أول قيد: JV-00001');
  assert(formatDoc('INV', 42, 4) === 'INV-0042', 'فاتورة 42: INV-0042');
  assert(formatDoc('PAY', 1000, 5) === 'PAY-01000', 'سند 1000: PAY-01000');
}

// ===================== 6. صلاحيات الأدوار =====================
function testRolePermissions(): void {
  const ROLE_PERMISSIONS: Record<string, string[]> = {
    manager: ['dashboard.view', 'treasury.view', 'accounting.view', 'reports.export'],
    accountant: ['dashboard.view', 'treasury.view', 'accounting.view', 'accounting.add'],
    user: ['dashboard.view'],
  };

  function hasPermission(roleId: string, perm: string): boolean {
    return (ROLE_PERMISSIONS[roleId] ?? []).includes(perm);
  }

  assert(hasPermission('manager', 'reports.export'), 'المدير يملك صلاحية التقارير');
  assert(!hasPermission('user', 'reports.export'), 'المستخدم العادي لا يملك التقارير');
  assert(hasPermission('accountant', 'accounting.add'), 'المحاسب يملك إضافة القيود');
  assert(!hasPermission('user', 'treasury.view'), 'المستخدم العادي لا يرى الخزينة');
  assert(!hasPermission('manager', 'nonexistent.perm'), 'صلاحية غير موجودة = false');
}

// ===================== 7. مراجعة الخزائن =====================

interface CashTx { type: string; amount: number; journal_entry_id: string | null; }
interface CashboxRow { opening_balance: number; balance: number; account_id: string | null; }
interface JournalLine { account_id: string; debit: number; credit: number; }
interface JournalEntry { status: string; lines: JournalLine[]; }

// محاكاة معادلة الرصيد المحسوب (بدون ازدواج الرصيد الافتتاحي)
function computeCashboxBalance(openingBalance: number, transactions: CashTx[]): number {
  return openingBalance + transactions.reduce((sum, t) => {
    if (t.type === 'receipt' || t.type === 'deposit') return sum + t.amount;
    if (t.type === 'payment' || t.type === 'withdrawal') return sum - t.amount;
    return sum; // type='opening' لا يُضاف لأن opening_balance يُضاف منفصلاً
  }, 0);
}

// محاكاة رصيد الحساب من القيود المرحّبة (posted + reversed)
function computeAccountBalance(accountId: string, entries: JournalEntry[]): number {
  return entries.reduce((sum, e) => {
    if (e.status !== 'posted' && e.status !== 'reversed') return sum;
    return sum + e.lines.reduce((s, l) => {
      if (l.account_id !== accountId) return s;
      return s + (l.debit - l.credit);
    }, 0);
  }, 0);
}

// محاكاة تجميع الحسابات المرتبطة (بدون ازدواج)
function sumLinkedAccounts(cashboxes: CashboxRow[], entries: JournalEntry[]): number {
  const linkedIds = new Set<string>();
  for (const cb of cashboxes) if (cb.account_id) linkedIds.add(cb.account_id);
  let total = 0;
  for (const accId of linkedIds) total += computeAccountBalance(accId, entries);
  return total;
}

function testTreasuryAudit(): void {
  // --- 7أ. خزينة برصيد افتتاحي ولها حركة opening ---
  {
    const opening = toCents(1000);
    const txs: CashTx[] = [
      { type: 'opening', amount: opening, journal_entry_id: 'je1' },
      { type: 'receipt', amount: toCents(500), journal_entry_id: 'je2' },
    ];
    const computed = computeCashboxBalance(opening, txs);
    // المحسوب = 1000 + 500 = 1500 (لا يُضاف opening مرة أخرى)
    assert(computed === toCents(1500), 'خزينة بحركة opening: الرصيد المحسوب لا يضاعف الافتتاحي');
  }

  // --- 7ب. خزينة قديمة لها opening_balance دون حركة opening ---
  {
    const opening = toCents(500);
    const txs: CashTx[] = [
      { type: 'receipt', amount: toCents(200), journal_entry_id: 'je1' },
      { type: 'payment', amount: toCents(100), journal_entry_id: 'je2' },
    ];
    const computed = computeCashboxBalance(opening, txs);
    assert(computed === toCents(600), 'خزينة بدون حركة opening: الرصيد = افتتاحي + صافي الحركات');
  }

  // --- 7ج. أكثر من خزينة مرتبطة بحسابات مختلفة ---
  {
    const cashboxes: CashboxRow[] = [
      { opening_balance: toCents(1000), balance: toCents(1500), account_id: 'acc_cash' },
      { opening_balance: toCents(500), balance: toCents(700), account_id: 'acc_cash_branch' },
    ];
    const entries: JournalEntry[] = [
      { status: 'posted', lines: [
        { account_id: 'acc_cash', debit: toCents(1500), credit: 0 },
        { account_id: 'acc_capital', debit: 0, credit: toCents(1500) },
      ]},
      { status: 'posted', lines: [
        { account_id: 'acc_cash_branch', debit: toCents(700), credit: 0 },
        { account_id: 'acc_capital', debit: 0, credit: toCents(700) },
      ]},
    ];
    const totalAccount = sumLinkedAccounts(cashboxes, entries);
    // acc_cash = 1500, acc_cash_branch = 700 → الإجمالي = 2200
    assert(totalAccount === toCents(2200), 'تجميع الحسابات المرتبطة بدون ازدواج');
    const totalCashbox = cashboxes.reduce((s, cb) => s + cb.balance, 0);
    assert(totalCashbox === toCents(2200), 'إجمالي الخزائن = إجمالي الحسابات المرتبطة');
    assert(totalCashbox - totalAccount === 0, 'لا يوجد فرق عند تطابق الأرصدة');
  }

  // --- 7د. القيود العكسية ---
  {
    const entries: JournalEntry[] = [
      // قيد أصلي: مدين الخزينة 300، دائن الإيراد 300
      { status: 'reversed', lines: [
        { account_id: 'acc_cash', debit: toCents(300), credit: 0 },
        { account_id: 'acc_sales', debit: 0, credit: toCents(300) },
      ]},
      // قيد عكسي: مدين الإيراد 300، دائن الخزينة 300
      { status: 'posted', lines: [
        { account_id: 'acc_sales', debit: toCents(300), credit: 0 },
        { account_id: 'acc_cash', debit: 0, credit: toCents(300) },
      ]},
    ];
    const balance = computeAccountBalance('acc_cash', entries);
    // 300 (من القيد المنعكس) + (-300) (من القيد العكسي) = 0
    assert(balance === 0, 'القيد الأصلي المنعكس + القيد العكسي المرحّل = صفر');
  }

  // --- 7هـ. القيود الملغاة (غير المرحّلة) ---
  {
    const entries: JournalEntry[] = [
      { status: 'posted', lines: [{ account_id: 'acc_cash', debit: toCents(500), credit: 0 }] },
      { status: 'draft', lines: [{ account_id: 'acc_cash', debit: toCents(999), credit: 0 }] },
    ];
    const balance = computeAccountBalance('acc_cash', entries);
    assert(balance === toCents(500), 'القيد المسود (draft) لا يُحتسب في الرصيد');
  }

  // --- 7و. التحويل بين خزانتين لا يظهر كإيراد أو مصروف ---
  {
    const txs: CashTx[] = [
      { type: 'withdrawal', amount: toCents(200), journal_entry_id: 'je_trf_out' },
      { type: 'deposit', amount: toCents(200), journal_entry_id: 'je_trf_in' },
    ];
    // withdrawal و deposit لا يُصنفان كـ receipt أو payment
    const hasRevenueOrExpense = txs.some((t) => t.type === 'receipt' || t.type === 'payment');
    assert(!hasRevenueOrExpense, 'التحويل بين الخزائن لا يُنتج receipt أو payment');
    // صافي التحويل على مستوى جميع الخزائن = صفر
    const fromBox = computeCashboxBalance(toCents(500), [{ type: 'withdrawal', amount: toCents(200), journal_entry_id: 'x' }]);
    const toBox = computeCashboxBalance(toCents(0), [{ type: 'deposit', amount: toCents(200), journal_entry_id: 'x' }]);
    assert(fromBox === toCents(300) && toBox === toCents(200), 'التحويل: المصدر ينقص والهدف يزيد بنفس المبلغ');
  }

  // --- 7ز. الحركات غير المرتبطة بقيود ---
  {
    const txs: CashTx[] = [
      { type: 'receipt', amount: toCents(100), journal_entry_id: 'je1' },
      { type: 'payment', amount: toCents(50), journal_entry_id: null },
    ];
    const unlinked = txs.filter((t) => !t.journal_entry_id);
    assert(unlinked.length === 1, 'اكتشاف حركة واحدة غير مرتبطة');
    assert(unlinked[0].type === 'payment', 'الحركة غير المرتبطة هي payment');
  }

  // --- 7ح. عدم ازدواج احتساب الحساب الأب والأبناء ---
  {
    // acc_cash (101) هو الحساب الأب، acc_cash_branch (10101) هو الابن
    // كل خزينة مربوطة بحسابها المستقل — لا يُجمع الأب مع الأبناء
    const cashboxes: CashboxRow[] = [
      { opening_balance: toCents(1000), balance: toCents(1000), account_id: 'acc_cash' },
      { opening_balance: toCents(500), balance: toCents(500), account_id: 'acc_cash_branch' },
    ];
    const entries: JournalEntry[] = [
      { status: 'posted', lines: [{ account_id: 'acc_cash', debit: toCents(1000), credit: 0 }] },
      { status: 'posted', lines: [{ account_id: 'acc_cash_branch', debit: toCents(500), credit: 0 }] },
    ];
    const linkedIds = new Set<string>();
    for (const cb of cashboxes) if (cb.account_id) linkedIds.add(cb.account_id);
    // كل حساب يُحسب مرة واحدة فقط
    assert(linkedIds.size === 2, 'حسابان مرتبطان بدون ازدواج');
    const totalAccount = sumLinkedAccounts(cashboxes, entries);
    assert(totalAccount === toCents(1500), 'الإجمالي = 1000 + 500 بدون مضاعفة');
  }

  // --- 7ط. خزينة جديدة بحساب فرعي ---
  {
    const cashboxes: CashboxRow[] = [
      { opening_balance: toCents(2000), balance: toCents(2500), account_id: 'acc_cash' },
      { opening_balance: toCents(300), balance: toCents(350), account_id: 'acc_cash_02' },
    ];
    const entries: JournalEntry[] = [
      { status: 'posted', lines: [{ account_id: 'acc_cash', debit: toCents(2500), credit: 0 }] },
      { status: 'posted', lines: [{ account_id: 'acc_cash_02', debit: toCents(350), credit: 0 }] },
    ];
    const totalCashbox = cashboxes.reduce((s, cb) => s + cb.balance, 0);
    const totalAccount = sumLinkedAccounts(cashboxes, entries);
    assert(totalCashbox === toCents(2850), 'إجمالي خزينتين بحسابين مختلفين');
    assert(totalAccount === toCents(2850), 'إجمالي حسابين فرعيين بدون ازدواج');
    assert(totalCashbox - totalAccount === 0, 'لا يوجد فرق عند ربط صحيح');
  }
}

// ===================== تشغيل الكل =====================
console.log('\n🧪 اختبارات المنطق المالي\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

console.log('\n1. تحويل العملة (toCents/toEgp)');
testCentsConversion();

console.log('\n2. توازن القيود المحاسبية');
testJournalBalance();

console.log('\n3. المتوسط المرجح للمخزون');
testWeightedAverage();

console.log('\n4. كشف حساب الطرف');
testPartyStatement();

console.log('\n5. ترقيم المستندات');
testDocumentNumbering();

console.log('\n6. صلاحيات الأدوار');
testRolePermissions();

console.log('\n7. مراجعة الخزائن');
testTreasuryAudit();

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`✅ نجح: ${passed} | ❌ فشل: ${failed}\n`);

if (failed > 0) process.exit(1);
