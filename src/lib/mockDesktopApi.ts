import type {
  DashboardSummary,
  DesktopActivityRow,
  DesktopApi,
  DesktopAuthUser,
  DesktopInvoiceRow,
  DesktopPartyRow,
  DesktopProductInput,
  DesktopProductRow,
  DesktopStockBalanceRow,
  DesktopStockCountInput,
  DesktopStockCountRow,
  DesktopStockEntryInput,
  DesktopStockMovementRow,
  DesktopStockTransferInput,
  DesktopWarehouseRow,
  MockCashbox,
  MockCashTransaction,
  MockCashTransactionInput,
} from './electronBridge';

const now = new Date().toISOString().slice(0, 10);
const mockUser: DesktopAuthUser = {
  id: 'mock-owner',
  username: 'preview',
  displayName: 'مستخدم المعاينة',
  roleId: 'owner',
  roleLabel: 'المالك',
  permissions: ['*'],
};

let products: DesktopProductRow[] = [
  { id: 'mock-feed', name: 'علف مركز', sku: 'FEED-001', category: 'feed', unit: 'كيس', reorder_level_milli: 5000, quantity_milli: 24000, total_value: 180000, unit_cost: 7500, is_active: true, is_low_stock: false },
  { id: 'mock-medicine', name: 'مطهر بيطري', sku: 'MED-001', category: 'medication', unit: 'عبوة', reorder_level_milli: 10000, quantity_milli: 6000, total_value: 42000, unit_cost: 7000, is_active: true, is_low_stock: true },
  { id: 'mock-supplies', name: 'مستلزمات حظائر', sku: 'SUP-001', category: 'supplies', unit: 'قطعة', reorder_level_milli: 3000, quantity_milli: 8500, total_value: 25500, unit_cost: 3000, is_active: true, is_low_stock: false },
];

const warehouses: DesktopWarehouseRow[] = [
  { id: 'wh_main', name: 'المخزن الرئيسي', is_default: true },
  { id: 'wh_branch', name: 'مخزن الفرع', is_default: false },
];

type StockSlot = { quantityMilli: number; totalValue: number };
const stockByWarehouse = new Map<string, Map<string, StockSlot>>([
  ['wh_main', new Map(products.map((product) => [product.id, { quantityMilli: product.quantity_milli, totalValue: product.total_value }]))],
  ['wh_branch', new Map()],
]);

let movements: DesktopStockMovementRow[] = [
  { id: 'mock-movement-1', date: now, type: 'purchase', direction: 'in', quantity_milli: 10000, unit_cost: 7500, total_cost: 75000, quantity_after_milli: 24000, value_after: 180000, reference_type: null, notes: 'رصيد تجريبي', created_at: new Date().toISOString(), product_id: 'mock-feed', product_name: 'علف مركز', unit: 'كيس', warehouse_name: 'المخزن الرئيسي' },
  { id: 'mock-movement-2', date: now, type: 'issue', direction: 'out', quantity_milli: 2000, unit_cost: 7000, total_cost: 14000, quantity_after_milli: 6000, value_after: 42000, reference_type: null, notes: 'استهلاك تجريبي', created_at: new Date(Date.now() - 60000).toISOString(), product_id: 'mock-medicine', product_name: 'مطهر بيطري', unit: 'عبوة', warehouse_name: 'المخزن الرئيسي' },
];

let counts: DesktopStockCountRow[] = [
  { id: 'mock-count-1', doc_number: 'ADJ-0001', date: now, status: 'completed', notes: 'جرد تجريبي', warehouse_name: 'المخزن الرئيسي' },
];

let cashboxes: MockCashbox[] = [
  { id: 'cash-main', name: 'الخزينة الرئيسية', opening_balance: 100000, balance: 100000, is_active: true, account_id: 'acc_cash' },
  { id: 'cash-branch', name: 'خزينة الفرع', opening_balance: 25000, balance: 25000, is_active: true, account_id: 'acc_cash' },
];
let cashTransactions: MockCashTransaction[] = [
  { id: 'cash-opening-main', doc_number: 'OPEN-0001', date: now, type: 'opening', cashbox_id: 'cash-main', amount: 100000, party_id: null, party_name: null, activity_id: null, payment_method: 'cash', description: 'رصيد افتتاحي تجريبي', created_by: mockUser.id, reference_type: 'opening_balance', reference_id: 'cash-main' },
  { id: 'cash-opening-branch', doc_number: 'OPEN-0002', date: now, type: 'opening', cashbox_id: 'cash-branch', amount: 25000, party_id: null, party_name: null, activity_id: null, payment_method: 'cash', description: 'رصيد افتتاحي تجريبي', created_by: mockUser.id, reference_type: 'opening_balance', reference_id: 'cash-branch' },
];
let cashDocumentSequence = 3;
let partyDocumentSequence = 1;
let invoiceDocumentSequence = 1;
let parties: DesktopPartyRow[] = [
  { id: 'supplier-main', name: 'مورد تجريبي', type: 'supplier', phone: '01000000000', status: 'active', activity_id: null, balance: 0 },
];
let invoices: DesktopInvoiceRow[] = [];
let partyTransactions: { partyId: string; date: string; type: string; referenceType: string; referenceId: string; debit: number; credit: number; description: string; createdBy: string | null }[] = [];
type MockCategory = { id: string; name: string; account_id: string | null };
type MockFinancialEntry = { id: string; doc_number: string; date: string; category_id: string; category_name: string; amount: number; activity_id: string | null; payment_method: string; description: string | null; is_shared?: boolean; cancelled?: boolean; reversal_of?: string | null; created_by: string | null; outstanding?: number; allocations?: { activityId: string; percentage: number; amount: number }[] };
let expenseCategories: MockCategory[] = [{ id: 'expense-feed', name: 'مستلزمات تشغيل', account_id: 'acc_admin' }];
let incomeCategories: MockCategory[] = [{ id: 'income-sale', name: 'إيرادات متنوعة', account_id: 'acc_sales' }];
let expenseEntries: MockFinancialEntry[] = [];
let incomeEntries: MockFinancialEntry[] = [];
let financialDocumentSequence = 1;

type MockEmployee = { id: string; name: string; phone: string | null; job_title: string | null; hire_date: string | null; base_salary: number; salary_type: string; status: string; activity_id: string | null };
type MockAttendance = { id: string; employee_id: string; employee_name: string; date: string; status: string; check_in: string | null; check_out: string | null; notes: string | null; created_by: string | null };
type MockAdvance = { id: string; employee_id: string; employee_name: string; date: string; amount: number; repayment_method: string; installment_amount: number; total_paid: number; remaining: number; status: string; created_by: string | null };
type MockSalary = { id: string; employee_id: string; employee_name: string; month: string; base_salary: number; overtime: number; deductions: number; advance_deduct: number; net_salary: number; status: string; created_by: string | null; paid_by: string | null };
type MockDeduction = { id: string; employee_id: string; amount: number; date: string; description: string | null; created_by: string | null };
let employees: MockEmployee[] = [];
let attendanceRecords: MockAttendance[] = [];
let employeeAdvances: MockAdvance[] = [];
let employeeDeductions: MockDeduction[] = [];
let salaryRecords: MockSalary[] = [];

function createMockEmployee(input: Record<string, unknown>) {
  const employee: MockEmployee = { id: id('employee'), name: String(input.name ?? '').trim(), phone: String(input.phone ?? '') || null, job_title: String(input.jobTitle ?? '') || null, hire_date: String(input.hireDate ?? '') || null, base_salary: Math.round(Number(input.baseSalary ?? 0) * 100), salary_type: String(input.salaryType ?? 'monthly'), status: 'active', activity_id: (input.activityId as string | null) ?? null };
  if (!employee.name || employee.base_salary <= 0) throw new Error('بيانات الموظف غير صحيحة');
  employees = [employee, ...employees];
  return { id: employee.id };
}

function employeeName(employeeId: string) {
  const employee = employees.find((row) => row.id === employeeId);
  if (!employee) throw new Error('الموظف غير موجود');
  return employee.name;
}

function createMockAttendance(input: Record<string, unknown>) {
  const employeeId = String(input.employeeId ?? '');
  const record: MockAttendance = { id: id('attendance'), employee_id: employeeId, employee_name: employeeName(employeeId), date: String(input.date ?? now), status: String(input.status ?? 'present'), check_in: (input.checkIn as string | null) ?? null, check_out: (input.checkOut as string | null) ?? null, notes: (input.notes as string | null) ?? null, created_by: (input.createdBy as string | null) ?? mockUser.id };
  attendanceRecords = [record, ...attendanceRecords.filter((row) => !(row.employee_id === employeeId && row.date === record.date))];
}

function createMockDeduction(input: Record<string, unknown>) {
  const employeeId = String(input.employeeId ?? '');
  employeeName(employeeId);
  const amount = Math.round(Number(input.amount ?? 0) * 100);
  if (amount <= 0) throw new Error('الخصم يجب أن يكون أكبر من صفر');
  const deduction: MockDeduction = { id: id('deduction'), employee_id: employeeId, amount, date: String(input.date ?? now), description: (input.description as string | null) ?? null, created_by: (input.createdBy as string | null) ?? mockUser.id };
  employeeDeductions = [deduction, ...employeeDeductions];
  return { id: deduction.id };
}

function createMockAdvance(input: Record<string, unknown>) {
  const employeeId = String(input.employeeId ?? '');
  const amount = Math.round(Number(input.amount ?? 0) * 100);
  if (!employeeId || amount <= 0) throw new Error('بيانات السلفة غير صحيحة');
  const installment = Math.round(Number(input.installmentAmount ?? 0) * 100);
  const advance: MockAdvance = { id: id('advance'), employee_id: employeeId, employee_name: employeeName(employeeId), date: String(input.date ?? now), amount, repayment_method: String(input.repaymentMethod ?? 'installment'), installment_amount: installment, total_paid: 0, remaining: amount, status: 'active', created_by: (input.createdBy as string | null) ?? mockUser.id };
  createMockCashTransaction({ date: advance.date, type: 'payment', cashboxId: String(input.cashboxId ?? 'cash-main'), amount: amount / 100, createdBy: advance.created_by, description: `سلفة ${advance.employee_name}`, referenceType: 'advance', referenceId: advance.id });
  employeeAdvances = [advance, ...employeeAdvances];
  return { id: advance.id, docNumber: `ADV-${String(employeeAdvances.length).padStart(4, '0')}` };
}

function createMockSalary(input: Record<string, unknown>) {
  const month = String(input.month ?? now).slice(0, 7);
  const targetEmployees = input.employeeId ? employees.filter((employee) => employee.id === String(input.employeeId)) : employees.filter((employee) => employee.status === 'active');
  let first: MockSalary | undefined;
  for (const employee of targetEmployees) {
    if (salaryRecords.some((record) => record.employee_id === employee.id && record.month.startsWith(month))) continue;
    const deductions = employeeDeductions.filter((row) => row.employee_id === employee.id && row.date.startsWith(month)).reduce((sum, row) => sum + row.amount, 0);
    const advance = employeeAdvances.find((row) => row.employee_id === employee.id && row.status === 'active');
    const advanceDeduct = Math.min(advance?.remaining ?? 0, Number(input.advanceDeduct ?? advance?.installment_amount ?? 0));
    const salary: MockSalary = { id: id('salary'), employee_id: employee.id, employee_name: employee.name, month: `${month}-01`, base_salary: employee.base_salary, overtime: 0, deductions, advance_deduct: advanceDeduct, net_salary: employee.base_salary - deductions - advanceDeduct, status: 'pending', created_by: (input.createdBy as string | null) ?? mockUser.id, paid_by: null };
    salaryRecords = [salary, ...salaryRecords];
    first = first ?? salary;
  }
  if (!first) throw new Error('مسير الرواتب موجود بالفعل أو لا يوجد موظفون');
  return { id: first.id, docNumber: `SAL-${month}`, net: first.net_salary, advanceDeduct: first.advance_deduct };
}

function payMockSalary(input: Record<string, unknown>) {
  const salary = salaryRecords.find((row) => row.id === String(input.id ?? input.salaryId ?? ''));
  if (!salary) throw new Error('مسير الراتب غير موجود');
  if (salary.status === 'paid') throw new Error('تم صرف مسير الراتب مسبقًا');
  createMockCashTransaction({ date: String(input.date ?? now), type: 'payment', cashboxId: String(input.cashboxId ?? 'cash-main'), amount: salary.net_salary / 100, createdBy: (input.createdBy as string | null) ?? mockUser.id, description: `صرف راتب ${salary.employee_name}`, referenceType: 'salary', referenceId: salary.id });
  salary.status = 'paid';
  salary.paid_by = (input.createdBy as string | null) ?? mockUser.id;
  if (salary.advance_deduct > 0) {
    const advance = employeeAdvances.find((row) => row.employee_id === salary.employee_id && row.status === 'active');
    if (advance) { advance.total_paid += salary.advance_deduct; advance.remaining -= salary.advance_deduct; advance.status = advance.remaining === 0 ? 'paid' : 'active'; }
  }
  return { id: salary.id };
}

type MockAccount = { id: string; code: string; name: string; type: string; parent_id: string | null; is_active: boolean; is_system: boolean; balance: number };
type MockJournalLine = { id: string; entry_id: string; account_id: string; account_code: string; account_name: string; debit: number; credit: number; description: string | null };
type MockJournalEntry = { id: string; entry_number: string; date: string; description: string | null; reference_type: string | null; reference_id: string | null; activity_id: string | null; status: string; created_by: string | null; lines: MockJournalLine[] };
let accountingSequence = 1;
let accounts: MockAccount[] = [
  { id: 'acc_cash', code: '1100', name: 'الخزينة', type: 'asset', parent_id: null, is_active: true, is_system: true, balance: 0 },
  { id: 'acc_receivable', code: '1200', name: 'العملاء', type: 'asset', parent_id: null, is_active: true, is_system: true, balance: 0 },
  { id: 'acc_payable', code: '2100', name: 'الموردون والالتزامات', type: 'liability', parent_id: null, is_active: true, is_system: true, balance: 0 },
  { id: 'acc_sales', code: '4100', name: 'الإيرادات', type: 'revenue', parent_id: null, is_active: true, is_system: true, balance: 0 },
  { id: 'acc_admin', code: '5100', name: 'المصروفات التشغيلية', type: 'expense', parent_id: null, is_active: true, is_system: true, balance: 0 },
  { id: 'acc_salaries', code: '5200', name: 'الرواتب', type: 'expense', parent_id: null, is_active: true, is_system: true, balance: 0 },
];
let journalEntries: MockJournalEntry[] = [];

function createMockAccount(input: Record<string, unknown>) {
  const code = String(input.code ?? '').trim();
  if (!code || accounts.some((account) => account.code === code)) throw new Error('كود الحساب مستخدم بالفعل');
  const account: MockAccount = { id: id('account'), code, name: String(input.name ?? '').trim(), type: String(input.type ?? 'expense'), parent_id: (input.parentId as string | null) ?? null, is_active: true, is_system: false, balance: 0 };
  if (!account.name) throw new Error('اسم الحساب مطلوب');
  accounts = [...accounts, account];
  return { id: account.id };
}

function createMockJournal(input: Record<string, unknown>) {
  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  const lines = rawLines.map((raw) => { const line = raw as { accountId?: string; debit?: number; credit?: number; description?: string }; const account = accounts.find((row) => row.id === line.accountId); if (!account) throw new Error('الحساب غير موجود'); return { account, debit: Math.round(Number(line.debit ?? 0) * 100), credit: Math.round(Number(line.credit ?? 0) * 100), description: line.description ?? null }; });
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  if (debit <= 0 || debit !== credit) throw new Error('القيد غير متوازن');
  const entryId = id('journal');
  const entryNumber = `JV-${String(accountingSequence++).padStart(4, '0')}`;
  const entry: MockJournalEntry = { id: entryId, entry_number: entryNumber, date: String(input.date ?? now), description: (input.description as string | null) ?? null, reference_type: (input.referenceType as string | null) ?? null, reference_id: (input.referenceId as string | null) ?? null, activity_id: (input.activityId as string | null) ?? null, status: 'posted', created_by: (input.createdBy as string | null) ?? mockUser.id, lines: lines.map((line) => ({ id: id('journal-line'), entry_id: entryId, account_id: line.account.id, account_code: line.account.code, account_name: line.account.name, debit: line.debit, credit: line.credit, description: line.description })) };
  journalEntries = [entry, ...journalEntries];
  for (const line of lines) line.account.balance += line.debit - line.credit;
  return { id: entryId, entryNumber };
}

function reverseMockJournal(input: Record<string, unknown>) {
  const original = journalEntries.find((entry) => entry.id === String(input.entryId ?? ''));
  if (!original || original.status === 'reversed') throw new Error('القيد غير موجود أو ملغى');
  const reversal = createMockJournal({ date: String(input.date ?? now), description: `قيد عكسي لـ ${original.entry_number}`, referenceType: 'reversal', referenceId: original.id, createdBy: input.createdBy ?? mockUser.id, lines: original.lines.map((line) => ({ accountId: line.account_id, debit: line.credit / 100, credit: line.debit / 100, description: `عكس ${line.description ?? ''}` })) });
  original.status = 'reversed';
  return reversal;
}

function mockJournalRows(input: Record<string, unknown>) {
  const dateFrom = String(input.dateFrom ?? '');
  const dateTo = String(input.dateTo ?? '');
  return journalEntries.filter((entry) => (!dateFrom || entry.date >= dateFrom) && (!dateTo || entry.date <= dateTo)).map((entry) => ({ ...entry, lines: entry.lines.map((line) => ({ ...line })) }));
}

function mockTrialBalance(input: Record<string, unknown> = {}) {
  const entries = mockJournalRows(input);
  const rows = accounts.map((account) => { const debit = entries.flatMap((entry) => entry.lines).filter((line) => line.account_id === account.id).reduce((sum, line) => sum + line.debit, 0); const credit = entries.flatMap((entry) => entry.lines).filter((line) => line.account_id === account.id).reduce((sum, line) => sum + line.credit, 0); return { account_id: account.id, code: account.code, name: account.name, type: account.type, debit, credit }; }).filter((row) => row.debit || row.credit);
  return { rows, totalDebit: rows.reduce((sum, row) => sum + row.debit, 0), totalCredit: rows.reduce((sum, row) => sum + row.credit, 0) };
}

function mockProfitLoss(input: Record<string, unknown> = {}) {
  const entries = mockJournalRows(input);
  const totals = new Map<string, { type: string; debit: number; credit: number; name: string }>();
  for (const entry of entries) for (const line of entry.lines) { const account = accounts.find((row) => row.id === line.account_id); if (account && (account.type === 'revenue' || account.type === 'expense')) { const current = totals.get(account.id) ?? { type: account.type, debit: 0, credit: 0, name: account.name }; current.debit += line.debit; current.credit += line.credit; totals.set(account.id, current); } }
  const revenues = [...totals.values()].filter((row) => row.type === 'revenue').map((row) => ({ account: row.name, amount: (row.credit - row.debit) / 100 }));
  const expenses = [...totals.values()].filter((row) => row.type === 'expense').map((row) => ({ account: row.name, amount: (row.debit - row.credit) / 100 }));
  const totalRevenues = revenues.reduce((sum, row) => sum + row.amount, 0);
  const totalExpenses = expenses.reduce((sum, row) => sum + row.amount, 0);
  return { revenues, expenses, totalRevenues, totalExpenses, netProfit: totalRevenues - totalExpenses };
}

function mockLedger(input: Record<string, unknown>) {
  const account = accounts.find((row) => row.id === String(input.accountId ?? ''));
  if (!account) throw new Error('الحساب غير موجود');
  let balance = 0;
  const rows = mockJournalRows(input).filter((entry) => entry.lines.some((line) => line.account_id === account.id)).flatMap((entry) => entry.lines.filter((line) => line.account_id === account.id).map((line) => { balance += line.debit - line.credit; return { date: entry.date, entry_number: entry.entry_number, description: entry.description, debit: line.debit, credit: line.credit, balance }; }));
  return { account, rows, opening: 0, closing: balance };
}

const activities: DesktopActivityRow[] = [
  { id: 'fattening', name: 'التسمين', description: null, is_active: 1, sort_order: 1 },
  { id: 'dairy', name: 'إنتاج الألبان', description: null, is_active: 1, sort_order: 2 },
  { id: 'breeding', name: 'التربية', description: null, is_active: 1, sort_order: 3 },
];

const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const findProduct = (productId: string) => products.find((product) => product.id === productId);
const warehouseName = (warehouseId: string) => warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ?? 'المخزن الرئيسي';
const cashbox = (cashboxId: string) => cashboxes.find((box) => box.id === cashboxId);
const cashDocumentNumber = (prefix: string) => `${prefix}-${String(cashDocumentSequence++).padStart(4, '0')}`;
const cashIsInflow = (type: MockCashTransactionInput['type']) => type === 'receipt' || type === 'deposit' || type === 'opening';

function createMockCashTransaction(input: MockCashTransactionInput): { id: string; docNumber: string } {
  const box = cashbox(input.cashboxId);
  const amount = Math.round(input.amount * 100);
  if (!box || !box.is_active) throw new Error('الخزينة غير موجودة أو غير مفعّلة');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر');
  if (!cashIsInflow(input.type) && box.balance < amount) throw new Error('الرصيد غير كافٍ للسحب');
  box.balance += cashIsInflow(input.type) ? amount : -amount;
  const docNumber = cashDocumentNumber(cashIsInflow(input.type) ? 'RCV' : 'PAY');
  cashTransactions = [{ id: id('cash'), doc_number: docNumber, date: input.date, type: input.type, cashbox_id: box.id, amount, party_id: input.partyId ?? null, party_name: null, activity_id: input.activityId ?? null, payment_method: input.paymentMethod ?? 'cash', description: input.description ?? null, created_by: input.createdBy ?? mockUser.id, reference_type: input.referenceType ?? null, reference_id: input.referenceId ?? null }, ...cashTransactions];
  return { id: cashTransactions[0].id, docNumber };
}

function updatePartyBalance(partyId: string, delta: number) {
  const party = parties.find((row) => row.id === partyId);
  if (!party) throw new Error('المورد غير موجود');
  party.balance += delta;
}

function createMockInvoice(input: Record<string, unknown>) {
  const docType = String(input.docType ?? '');
  if (docType !== 'purchase' && docType !== 'sales') throw new Error('نوع الفاتورة غير مدعوم في المعاينة');
  const partyId = String(input.partyId ?? '');
  const party = parties.find((row) => row.id === partyId);
  if (!party) throw new Error('المورد غير موجود');
  const rawItems = Array.isArray(input.items) ? input.items : [];
  const items = rawItems.map((raw, index) => {
    const item = raw as { productId?: string; quantity?: number; unitPrice?: number; discount?: number };
    const product = findProduct(String(item.productId ?? ''));
    const quantity = Number(item.quantity ?? 0);
    const unitPrice = Number(item.unitPrice ?? 0);
    const discount = Number(item.discount ?? 0);
    if (!product || quantity <= 0 || unitPrice <= 0) throw new Error('بيانات بند الفاتورة غير صحيحة');
    const lineTotal = Math.round(quantity * unitPrice - discount);
    if (docType === 'purchase') { addMovement({ date: String(input.date ?? now), productId: product.id, warehouseId: 'wh_main', quantity, unitCost: quantity ? Math.round(lineTotal / quantity) : unitPrice, notes: `فاتورة شراء ${party.name}` }, 'in', lineTotal, 'purchase'); movements[0].reference_type = 'invoice'; }
    return { id: `${id('invoice-item')}-${index}`, invoice_id: '', product_id: product.id, description: product.name, quantity_milli: Math.round(quantity * 1000), returned_milli: 0, unit: product.unit, unit_price: unitPrice, discount, total: lineTotal };
  });
  const subtotal = items.reduce((sum, item) => sum + Math.round(item.quantity_milli * item.unit_price / 1000), 0);
  const discount = items.reduce((sum, item) => sum + item.discount, 0) + Number(input.discount ?? 0);
  const total = subtotal - discount;
  if (total <= 0) throw new Error('إجمالي الفاتورة يجب أن يكون أكبر من صفر');
  const invoiceId = id('invoice');
  const docNumber = `PUR-${String(invoiceDocumentSequence++).padStart(4, '0')}`;
  const invoice: DesktopInvoiceRow = { id: invoiceId, doc_number: docNumber, date: String(input.date ?? now), doc_type: docType as 'purchase' | 'sales', party_id: partyId, activity_id: (input.activityId as string | null) ?? null, subtotal, discount, total, paid_amount: 0, outstanding: total, payment_method: String(input.paymentMethod ?? 'credit'), status: 'posted', notes: (input.notes as string | null) ?? null, party_name: party.name, created_by: (input.createdBy as string | null) ?? null, items: items.map((item) => ({ ...item, invoice_id: invoiceId })) };
  invoices = [invoice, ...invoices];
  if (docType === 'purchase' && invoice.payment_method !== 'cash') {
    updatePartyBalance(partyId, -total);
    partyTransactions = [{ partyId, date: invoice.date, type: 'invoice', referenceType: 'invoice', referenceId: invoiceId, debit: 0, credit: total, description: `فاتورة مشتريات ${docNumber}`, createdBy: (input.createdBy as string | null) ?? null }, ...partyTransactions];
  }
  return { id: invoiceId, docNumber };
}

function payMockInvoice(input: Record<string, unknown>) {
  const invoice = invoices.find((row) => row.id === String(input.invoiceId ?? ''));
  if (!invoice) throw new Error('الفاتورة غير موجودة');
  const amount = Math.round(Number(input.amount ?? 0));
  if (!Number.isFinite(amount) || amount <= 0 || amount > invoice.total - invoice.paid_amount) throw new Error('مبلغ السداد غير صحيح');
  const partyId = invoice.party_id;
  if (!partyId || !input.cashboxId) throw new Error('بيانات السداد غير مكتملة');
  createMockCashTransaction({ date: String(input.date ?? now), type: 'payment', cashboxId: String(input.cashboxId), amount: amount / 100, createdBy: mockUser.id, description: `سداد ${invoice.doc_number}`, referenceType: 'invoice', referenceId: invoice.id });
  invoice.paid_amount += amount;
  invoice.outstanding = invoice.total - invoice.paid_amount;
  invoice.status = invoice.outstanding === 0 ? 'paid' : 'posted';
  updatePartyBalance(partyId, amount);
  partyTransactions = [{ partyId, date: invoice.date, type: 'payment', referenceType: 'payment', referenceId: invoice.id, debit: amount, credit: 0, description: `سداد ${invoice.doc_number}`, createdBy: mockUser.id }, ...partyTransactions];
  return { id: id('payment'), docNumber: `PAY-${String(partyDocumentSequence++).padStart(4, '0')}` };
}

function returnMockInvoice(input: Record<string, unknown>) {
  const invoice = invoices.find((row) => row.id === String(input.invoiceId ?? ''));
  if (!invoice || invoice.doc_type !== 'purchase') throw new Error('فاتورة الشراء غير موجودة');
  const items = Array.isArray(input.items) ? input.items : [];
  let total = 0;
  for (const raw of items) {
    const item = raw as { productId?: string; quantity?: number };
    const line = invoice.items.find((candidate) => candidate.product_id === item.productId);
    const quantity = Number(item.quantity ?? 0);
    if (!line || quantity <= 0 || line.returned_milli + Math.round(quantity * 1000) > line.quantity_milli) throw new Error('كمية المرتجع تتجاوز المتاح');
    const value = Math.round(quantity * line.unit_price);
    addMovement({ date: String(input.date ?? now), productId: line.product_id!, warehouseId: 'wh_main', quantity, notes: `مرتجع مشتريات ${invoice.doc_number}` }, 'out', value, 'purchase_return');
    movements[0].reference_type = 'invoice';
    line.returned_milli += Math.round(quantity * 1000);
    total += value;
  }
  const returnId = id('purchase-return');
  if (invoice.party_id) {
    updatePartyBalance(invoice.party_id, total);
    partyTransactions = [{ partyId: invoice.party_id, date: String(input.date ?? now), type: 'return', referenceType: 'invoice', referenceId: returnId, debit: total, credit: 0, description: `مرتجع مشتريات ${invoice.doc_number}`, createdBy: mockUser.id }, ...partyTransactions];
  }
  return { id: returnId, docNumber: `PR-${String(partyDocumentSequence++).padStart(4, '0')}`, total };
}

function categoryName(categories: MockCategory[], categoryId: string) {
  const category = categories.find((row) => row.id === categoryId);
  if (!category) throw new Error('التصنيف غير موجود');
  return category.name;
}

function validateAllocations(input: Record<string, unknown>) {
  const raw = Array.isArray(input.allocations) ? input.allocations : [];
  const allocations = raw.map((row) => { const value = row as { activityId?: string; percentage?: number }; return { activityId: String(value.activityId ?? ''), percentage: Number(value.percentage ?? 0) }; });
  if (input.isShared && (allocations.length === 0 || Math.round(allocations.reduce((sum, row) => sum + row.percentage, 0) * 100) !== 10000)) throw new Error('يجب أن تساوي نسب التوزيع 100%');
  return allocations;
}

function createMockExpense(input: Record<string, unknown>) {
  const amountEgp = Number(input.amount ?? 0);
  if (!Number.isFinite(amountEgp) || amountEgp <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر');
  const categoryId = String(input.categoryId ?? '');
  const amount = Math.round(amountEgp * 100);
  const allocations = validateAllocations(input);
  const entryId = id('expense');
  const docNumber = `EXP-${String(financialDocumentSequence++).padStart(4, '0')}`;
  const entry: MockFinancialEntry = { id: entryId, doc_number: docNumber, date: String(input.date ?? now), category_id: categoryId, category_name: categoryName(expenseCategories, categoryId), amount, activity_id: (input.activityId as string | null) ?? null, payment_method: String(input.paymentMethod ?? 'cash'), description: (input.description as string | null) ?? null, is_shared: Boolean(input.isShared), cancelled: false, reversal_of: null, created_by: (input.createdBy as string | null) ?? mockUser.id, outstanding: String(input.paymentMethod ?? 'cash') === 'credit' ? amount : 0, allocations: allocations.map((row) => ({ ...row, amount: Math.round(amount * row.percentage / 100) })) };
  expenseEntries = [entry, ...expenseEntries];
  if (entry.payment_method === 'cash') createMockCashTransaction({ date: entry.date, type: 'payment', cashboxId: String(input.cashboxId ?? 'cash-main'), amount: amountEgp, createdBy: entry.created_by, description: entry.description ?? `مصروف ${entry.category_name}`, referenceType: 'expense', referenceId: entry.id });
  createMockJournal({ date: entry.date, description: entry.description ?? `مصروف ${entry.category_name}`, referenceType: 'expense', referenceId: entry.id, activityId: entry.activity_id, createdBy: entry.created_by, lines: [{ accountId: expenseCategories.find((category) => category.id === categoryId)?.account_id ?? 'acc_admin', debit: amountEgp, credit: 0 }, { accountId: entry.payment_method === 'cash' ? 'acc_cash' : 'acc_payable', debit: 0, credit: amountEgp }] });
  return { id: entryId, docNumber, amount };
}

function createMockIncome(input: Record<string, unknown>) {
  const amountEgp = Number(input.amount ?? 0);
  if (!Number.isFinite(amountEgp) || amountEgp <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر');
  const categoryId = String(input.categoryId ?? '');
  const amount = Math.round(amountEgp * 100);
  const entryId = id('income');
  const docNumber = `INC-${String(financialDocumentSequence++).padStart(4, '0')}`;
  const entry: MockFinancialEntry = { id: entryId, doc_number: docNumber, date: String(input.date ?? now), category_id: categoryId, category_name: categoryName(incomeCategories, categoryId), amount, activity_id: (input.activityId as string | null) ?? null, payment_method: String(input.paymentMethod ?? 'cash'), description: (input.description as string | null) ?? null, cancelled: false, reversal_of: null, created_by: (input.createdBy as string | null) ?? mockUser.id };
  incomeEntries = [entry, ...incomeEntries];
  if (entry.payment_method === 'cash') createMockCashTransaction({ date: entry.date, type: 'receipt', cashboxId: String(input.cashboxId ?? 'cash-main'), amount: amountEgp, createdBy: entry.created_by, description: entry.description ?? `إيراد ${entry.category_name}`, referenceType: 'income', referenceId: entry.id });
  createMockJournal({ date: entry.date, description: entry.description ?? `إيراد ${entry.category_name}`, referenceType: 'income', referenceId: entry.id, activityId: entry.activity_id, createdBy: entry.created_by, lines: [{ accountId: entry.payment_method === 'cash' ? 'acc_cash' : 'acc_receivable', debit: amountEgp, credit: 0 }, { accountId: incomeCategories.find((category) => category.id === categoryId)?.account_id ?? 'acc_sales', debit: 0, credit: amountEgp }] });
  return { id: entryId, docNumber, amount };
}

function payMockExpense(input: Record<string, unknown>) {
  const entry = expenseEntries.find((row) => row.id === String(input.expenseId ?? ''));
  const amount = Math.round(Number(input.amount ?? 0) * 100);
  if (!entry || entry.payment_method !== 'credit' || !entry.outstanding || amount <= 0 || amount > entry.outstanding) throw new Error('مبلغ السداد غير صحيح');
  createMockCashTransaction({ date: String(input.date ?? now), type: 'payment', cashboxId: String(input.cashboxId ?? 'cash-main'), amount: amount / 100, createdBy: (input.createdBy as string | null) ?? mockUser.id, description: `سداد ${entry.doc_number}`, referenceType: 'expense', referenceId: entry.id });
  entry.outstanding -= amount;
  return { id: id('expense-payment'), docNumber: `PAY-${String(financialDocumentSequence++).padStart(4, '0')}` };
}

function cancelMockExpense(input: { expenseId: string; date: string }) {
  const entry = expenseEntries.find((row) => row.id === input.expenseId);
  if (!entry || entry.cancelled) throw new Error('المصروف غير موجود أو ملغى');
  entry.cancelled = true;
  const originalJournal = journalEntries.find((journal) => journal.reference_id === entry.id && journal.reference_type === 'expense');
  if (originalJournal) reverseMockJournal({ entryId: originalJournal.id, date: input.date, createdBy: mockUser.id });
  if (entry.payment_method === 'cash') createMockCashTransaction({ date: input.date, type: 'receipt', cashboxId: 'cash-main', amount: entry.amount / 100, createdBy: mockUser.id, description: `عكس ${entry.doc_number}`, referenceType: 'expense_reversal', referenceId: entry.id });
  const reversal: MockFinancialEntry = { ...entry, id: id('expense-reversal'), doc_number: `REV-${String(financialDocumentSequence++).padStart(4, '0')}`, amount: -entry.amount, cancelled: false, reversal_of: entry.id, outstanding: 0, created_by: mockUser.id };
  expenseEntries = [reversal, ...expenseEntries];
  return { id: reversal.id, reversalEntryNumber: reversal.doc_number };
}

function cancelMockIncome(input: { incomeId: string; date: string }) {
  const entry = incomeEntries.find((row) => row.id === input.incomeId);
  if (!entry || entry.cancelled) throw new Error('الإيراد غير موجود أو ملغى');
  entry.cancelled = true;
  const originalJournal = journalEntries.find((journal) => journal.reference_id === entry.id && journal.reference_type === 'income');
  if (originalJournal) reverseMockJournal({ entryId: originalJournal.id, date: input.date, createdBy: mockUser.id });
  if (entry.payment_method === 'cash') createMockCashTransaction({ date: input.date, type: 'payment', cashboxId: 'cash-main', amount: entry.amount / 100, createdBy: mockUser.id, description: `عكس ${entry.doc_number}`, referenceType: 'income_reversal', referenceId: entry.id });
  const reversal: MockFinancialEntry = { ...entry, id: id('income-reversal'), doc_number: `REV-${String(financialDocumentSequence++).padStart(4, '0')}`, amount: -entry.amount, cancelled: false, reversal_of: entry.id, created_by: mockUser.id };
  incomeEntries = [reversal, ...incomeEntries];
  return { id: reversal.id, reversalEntryNumber: reversal.doc_number };
}

function createMockCashTransfer(input: Record<string, unknown>) {
  const fromCashboxId = String(input.fromCashboxId ?? '');
  const toCashboxId = String(input.toCashboxId ?? '');
  const amount = Number(input.amount);
  if (!fromCashboxId || !toCashboxId || fromCashboxId === toCashboxId) throw new Error('اختر خزانتين مختلفتين');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر');
  const from = cashbox(fromCashboxId);
  const to = cashbox(toCashboxId);
  if (!from || !to || !from.is_active || !to.is_active) throw new Error('الخزينة غير موجودة أو غير مفعّلة');
  const cents = Math.round(amount * 100);
  if (from.balance < cents) throw new Error('الرصيد غير كافٍ للتحويل');
  from.balance -= cents;
  to.balance += cents;
  const transferId = id('transfer');
  const docNumber = cashDocumentNumber('TRF');
  const common = { date: String(input.date ?? now), party_id: null, party_name: null, activity_id: null, payment_method: 'cash', description: String(input.description ?? 'تحويل بين الخزائن'), created_by: String(input.createdBy ?? mockUser.id), reference_type: 'cash_transfer', reference_id: transferId };
  cashTransactions = [
    { id: `${transferId}-out`, doc_number: docNumber, type: 'withdrawal', cashbox_id: from.id, amount: cents, ...common },
    { id: `${transferId}-in`, doc_number: docNumber, type: 'deposit', cashbox_id: to.id, amount: cents, ...common },
    ...cashTransactions,
  ];
  return { id: transferId, docNumber, amount: cents };
}
const asProductInput = (input: DesktopProductInput, product: DesktopProductRow): DesktopProductRow => ({
  ...product,
  name: input.name,
  sku: input.sku ?? null,
  category: input.category,
  unit: input.unit,
  reorder_level_milli: Math.round(input.reorderLevel * 1000),
  is_low_stock: product.quantity_milli <= Math.round(input.reorderLevel * 1000) && input.reorderLevel > 0,
});

function getWarehouseStock(warehouseId: string, productId: string): StockSlot {
  const warehouseStock = stockByWarehouse.get(warehouseId);
  if (!warehouseStock) throw new Error('المخزن غير موجود');
  const slot = warehouseStock.get(productId) ?? { quantityMilli: 0, totalValue: 0 };
  warehouseStock.set(productId, slot);
  return slot;
}

function syncProduct(product: DesktopProductRow) {
  const slots = Array.from(stockByWarehouse.values()).map((stock) => stock.get(product.id)).filter((slot): slot is StockSlot => Boolean(slot));
  product.quantity_milli = slots.reduce((sum, slot) => sum + slot.quantityMilli, 0);
  product.total_value = slots.reduce((sum, slot) => sum + slot.totalValue, 0);
  product.unit_cost = product.quantity_milli ? Math.round(product.total_value * 1000 / product.quantity_milli) : 0;
  product.is_low_stock = product.quantity_milli <= product.reorder_level_milli && product.reorder_level_milli > 0;
}

function balances(warehouseId: string): DesktopStockBalanceRow[] {
  const stock = stockByWarehouse.get(warehouseId);
  if (!stock) return [];
  return products.filter((product) => (stock.get(product.id)?.quantityMilli ?? 0) > 0).map((product) => {
    const slot = stock.get(product.id)!;
    return { product_id: product.id, product_name: product.name, unit: product.unit, quantity_milli: slot.quantityMilli, total_value: slot.totalValue };
  });
}

function addMovement(input: DesktopStockEntryInput, direction: 'in' | 'out', totalCost: number, type: string) {
  const product = findProduct(input.productId);
  if (!product) throw new Error('الصنف غير موجود');
  const quantityMilli = Math.round(input.quantity * 1000);
  const slot = getWarehouseStock(input.warehouseId, product.id);
  const delta = direction === 'in' ? quantityMilli : -quantityMilli;
  slot.quantityMilli = Math.max(0, slot.quantityMilli + delta);
  slot.totalValue = Math.max(0, slot.totalValue + (direction === 'in' ? totalCost : -totalCost));
  syncProduct(product);
  movements = [{
    id: id('movement'), date: input.date, type, direction, quantity_milli: quantityMilli, unit_cost: quantityMilli ? Math.round(totalCost * 1000 / quantityMilli) : 0, total_cost: totalCost,
    quantity_after_milli: slot.quantityMilli, value_after: slot.totalValue, reference_type: null, notes: input.notes ?? null, created_at: new Date().toISOString(), product_id: product.id, product_name: product.name, unit: product.unit, warehouse_name: warehouseName(input.warehouseId),
  }, ...movements];
}

function transfer(input: DesktopStockTransferInput) {
  if (input.fromWarehouseId === input.toWarehouseId) throw new Error('اختر مخزنين مختلفين');
  const product = findProduct(input.productId);
  if (!product) throw new Error('الصنف غير موجود');
  const quantityMilli = Math.round(input.quantity * 1000);
  const source = getWarehouseStock(input.fromWarehouseId, product.id);
  if (source.quantityMilli < quantityMilli) throw new Error('الكمية المتاحة غير كافية');
  const totalCost = source.quantityMilli ? Math.round(source.totalValue * quantityMilli / source.quantityMilli) : 0;
  const target = getWarehouseStock(input.toWarehouseId, product.id);
  source.quantityMilli -= quantityMilli;
  source.totalValue -= totalCost;
  target.quantityMilli += quantityMilli;
  target.totalValue += totalCost;
  syncProduct(product);
  const transferId = id('transfer');
  movements = [
    { id: `${transferId}-out`, date: input.date, type: 'transfer', direction: 'out', quantity_milli: quantityMilli, unit_cost: quantityMilli ? Math.round(totalCost * 1000 / quantityMilli) : 0, total_cost: totalCost, quantity_after_milli: source.quantityMilli, value_after: source.totalValue, reference_type: 'stock_transfer', notes: input.notes ?? null, created_at: new Date().toISOString(), product_id: product.id, product_name: product.name, unit: product.unit, warehouse_name: warehouseName(input.fromWarehouseId) },
    { id: `${transferId}-in`, date: input.date, type: 'transfer', direction: 'in', quantity_milli: quantityMilli, unit_cost: quantityMilli ? Math.round(totalCost * 1000 / quantityMilli) : 0, total_cost: totalCost, quantity_after_milli: target.quantityMilli, value_after: target.totalValue, reference_type: 'stock_transfer', notes: input.notes ?? null, created_at: new Date().toISOString(), product_id: product.id, product_name: product.name, unit: product.unit, warehouse_name: warehouseName(input.toWarehouseId) },
    ...movements,
  ];
  return { id: transferId, totalCost };
}

function runMockAudit() {
  const cashboxAudit = cashboxes.map((box) => {
    const boxTx = cashTransactions.filter((t) => t.cashbox_id === box.id);
    const linked = boxTx.filter((t) => (t as { journal_entry_id?: string | null }).journal_entry_id).length;
    const account = accounts.find((a) => a.id === box.account_id);
    let accountJournalBalance = 0;
    if (box.account_id) {
      const tbRows = mockTrialBalance().rows as Array<{ account_id: string; debit: number; credit: number }>;
      const tbRow = tbRows.find((r) => r.account_id === box.account_id);
      accountJournalBalance = tbRow ? tbRow.debit - tbRow.credit : 0;
    }
    return {
      cashboxId: box.id, cashboxName: box.name, isActive: box.is_active,
      openingBalance: box.opening_balance, balanceColumn: box.balance,
      computedBalance: box.balance, transactionCount: boxTx.length,
      linkedCount: linked, unlinkedCount: boxTx.length - linked,
      accountId: box.account_id ?? null, accountCode: account?.code ?? null,
      accountName: account?.name ?? null, accountJournalBalance,
      accountStoredBalance: accountJournalBalance,
      cashboxVsAccountDiff: box.balance - accountJournalBalance,
    };
  });
  const accountAudit = [];
  const linkedIds = new Set(cashboxes.map((b) => b.account_id).filter(Boolean));
  for (const accId of linkedIds) {
    const acc = accounts.find((a) => a.id === accId);
    if (!acc) continue;
    const tbRows = mockTrialBalance().rows as Array<{ account_id: string; debit: number; credit: number }>;
    const tbRow = tbRows.find((r) => r.account_id === accId);
    const bal = tbRow ? tbRow.debit - tbRow.credit : 0;
    accountAudit.push({ accountId: accId, accountCode: acc.code, accountName: acc.name, storedBalance: bal, journalBalance: bal, entryCount: 0 });
  }
  const unlinked = cashTransactions.filter((t) => !(t as { journal_entry_id?: string | null }).journal_entry_id).map((t) => {
    const box = cashboxes.find((b) => b.id === t.cashbox_id);
    return { id: t.id, doc_number: t.doc_number, date: t.date, type: t.type, cashbox_id: t.cashbox_id, cashbox_name: box?.name ?? '—', amount: t.amount, description: t.description, journal_entry_id: null };
  });
  const transfers: [] = [];
  const totalCashboxBalance = cashboxAudit.reduce((s, r) => s + r.balanceColumn, 0);
  const totalAccountBalance = accountAudit.reduce((s, r) => s + r.journalBalance, 0);
  return { cashboxes: cashboxAudit, accounts: accountAudit, totalCashboxBalance, totalAccountBalance, totalDifference: totalCashboxBalance - totalAccountBalance, storedVsJournalDifference: 0, unlinkedTransactions: unlinked, transfers, suggestedTreatment: [] };
}

const mockApi: DesktopApi = {
  platform: 'browser-preview',
  versions: { electron: 'preview', node: 'preview' },
  dbStatus: async () => ({ path: 'browser-preview', schemaVersion: 'mock' }),
  backupCreate: async () => ({ path: 'browser-preview-backup' }),
  auth: {
    state: async () => ({ needsSetup: false }),
    setupOwner: async () => mockUser,
    login: async () => mockUser,
    logout: async () => undefined,
    changePassword: async () => undefined,
    currentUser: async () => mockUser,
  },
  users: {
    list: async () => [{ id: mockUser.id, username: mockUser.username, display_name: mockUser.displayName, role_id: mockUser.roleId, role_label: mockUser.roleLabel, is_active: true, created_at: now }],
    permissions: async () => [],
    create: async () => undefined,
    update: async () => undefined,
  },
  farm: {
    expenses: {
      categories: async () => ({ expense: expenseCategories, income: incomeCategories }),
      createCategory: async (input) => { const category = { id: id('expense-category'), name: input.name, account_id: input.accountId ?? 'acc_admin' }; expenseCategories = [...expenseCategories, category]; return { id: category.id }; },
      list: async () => expenseEntries,
      create: async (input) => createMockExpense(input),
      pay: async (input) => payMockExpense(input),
      cancel: async (input) => cancelMockExpense(input),
    },
    incomes: {
      list: async () => incomeEntries,
      createCategory: async (input) => { const category = { id: id('income-category'), name: input.name, account_id: input.accountId ?? 'acc_sales' }; incomeCategories = [...incomeCategories, category]; return { id: category.id }; },
      create: async (input) => createMockIncome(input),
      cancel: async (input) => cancelMockIncome(input),
    },
    parties: {
      list: async (args) => parties.filter((party) => !args?.type || party.type === args.type || party.type === 'both').map((party) => ({ ...party })),
      create: async (input) => { const party: DesktopPartyRow = { id: id('party'), name: input.name, type: input.type, phone: input.phone, status: 'active', activity_id: input.activityId, balance: input.openingBalance ?? 0 }; parties = [...parties, party]; return { id: party.id }; },
      statement: async (args) => { const party = parties.find((row) => row.id === args.partyId); if (!party) throw new Error('الطرف غير موجود'); const rows = partyTransactions.filter((row) => row.partyId === party.id).reverse().map((row) => ({ date: row.date, type: row.type, reference_type: row.referenceType, reference_id: row.referenceId, description: row.description, debit: row.debit, credit: row.credit })); let balance = 0; return { party: { ...party }, opening: 0, closing: party.balance, rows: rows.map((row) => { balance += row.debit - row.credit; return { ...row, balance }; }) }; },
      delete: async (partyId) => { parties = parties.filter((party) => party.id !== partyId); },
    },
    activities: { list: async () => activities },
    products: {
      list: async () => products,
      create: async (input) => { const product: DesktopProductRow = { id: id('product'), name: input.name, sku: input.sku ?? null, category: input.category, unit: input.unit, reorder_level_milli: Math.round(input.reorderLevel * 1000), quantity_milli: 0, total_value: 0, unit_cost: 0, is_active: true, is_low_stock: false }; products = [...products, product]; return { id: product.id }; },
      update: async (input) => { products = products.map((product) => product.id === input.id ? asProductInput(input, product) : product); return { id: input.id }; },
    },
    warehouses: { list: async () => warehouses, create: async (input) => { const warehouse = { id: id('warehouse'), name: input.name, is_default: false }; warehouses.push(warehouse); stockByWarehouse.set(warehouse.id, new Map()); return { id: warehouse.id }; } },
    stock: {
      balances: async ({ warehouseId }) => balances(warehouseId),
      movements: async (args) => movements.filter((movement) => (!args?.productId || movement.product_id === args.productId) && (!args?.warehouseId || movement.warehouse_name === warehouseName(args.warehouseId))),
      receive: async (input) => { const totalCost = Math.round((input.unitCost ?? 0) * input.quantity); addMovement(input, 'in', totalCost, 'adjustment'); return { totalCost }; },
      issue: async (input) => { const product = findProduct(input.productId); const slot = product ? getWarehouseStock(input.warehouseId, product.id) : null; if (!product || !slot || slot.quantityMilli < Math.round(input.quantity * 1000)) throw new Error('الكمية المتاحة غير كافية'); const totalCost = slot.quantityMilli ? Math.round(slot.totalValue * input.quantity * 1000 / slot.quantityMilli) : 0; addMovement(input, 'out', totalCost, 'issue'); return { totalCost }; },
      transfer: async (input: DesktopStockTransferInput) => transfer(input),
      counts: async () => counts,
      count: async (input: DesktopStockCountInput) => {
        let gains = 0;
        let losses = 0;
        for (const item of input.items) {
          const product = findProduct(item.productId);
          if (!product) throw new Error('الصنف غير موجود');
          const slot = getWarehouseStock(input.warehouseId, product.id);
          const countedMilli = Math.round(item.countedQuantity * 1000);
          const differenceMilli = countedMilli - slot.quantityMilli;
          if (differenceMilli === 0) continue;
          const unitCost = item.unitCost ?? (slot.quantityMilli ? Math.round(slot.totalValue * 1000 / slot.quantityMilli) : product.unit_cost);
          const differenceValue = Math.round(Math.abs(differenceMilli) * unitCost / 1000);
          if (differenceMilli > 0) { slot.quantityMilli = countedMilli; slot.totalValue += differenceValue; gains += differenceValue; } else { slot.quantityMilli = countedMilli; slot.totalValue = Math.max(0, slot.totalValue - differenceValue); losses += differenceValue; }
          syncProduct(product);
          movements = [{ id: id('movement'), date: input.date, type: 'stock_count', direction: differenceMilli > 0 ? 'in' : 'out', quantity_milli: Math.abs(differenceMilli), unit_cost: unitCost, total_cost: differenceValue, quantity_after_milli: slot.quantityMilli, value_after: slot.totalValue, reference_type: 'stock_count', notes: input.notes ?? null, created_at: new Date().toISOString(), product_id: product.id, product_name: product.name, unit: product.unit, warehouse_name: warehouseName(input.warehouseId) }, ...movements];
        }
        const count: DesktopStockCountRow = { id: id('count'), doc_number: `ADJ-${String(counts.length + 1).padStart(4, '0')}`, date: input.date, status: 'completed', notes: input.notes ?? null, warehouse_name: warehouseName(input.warehouseId) };
        counts = [count, ...counts];
        return { id: count.id, docNumber: count.doc_number, gains, losses };
      },
    },
    invoices: {
      list: async (args) => invoices.filter((invoice) => invoice.doc_type === args.docType),
      create: async (input) => { const result = createMockInvoice(input); const invoice = invoices.find((row) => row.id === result.id); return { id: result.id, docNumber: result.docNumber, total: invoice?.total ?? 0, paidAmount: invoice?.paid_amount ?? 0 }; },
      pay: async (input) => payMockInvoice(input),
      return: async (input) => { const result = returnMockInvoice(input); return { ...result, cost: result.total }; },
      cancel: async () => ({ id: '', reversalEntryNumber: null }),
    },
    customers: { credits: async () => [], refundCredit: async () => ({ id: id('refund'), docNumber: 'REF-0001', amount: 0, creditAfter: 0 }) },
    treasury: {
      cashboxes: async () => cashboxes,
      listCashboxes: async () => cashboxes.map((box) => ({ ...box })),
      listTransactions: async (limit = 100) => cashTransactions.slice(0, limit).map((transaction) => ({ ...transaction })),
      createCashbox: async (input) => {
        const name = String(input.name ?? '').trim();
        const openingBalance = Number(input.openingBalance ?? 0);
        if (!name) throw new Error('اسم الخزينة مطلوب');
        if (!Number.isFinite(openingBalance) || openingBalance < 0) throw new Error('الرصيد الافتتاحي غير صحيح');
        const box: MockCashbox = { id: id('cashbox'), name, opening_balance: Math.round(openingBalance * 100), balance: 0, is_active: true };
        cashboxes = [...cashboxes, box];
        if (openingBalance > 0) createMockCashTransaction({ date: String(input.date ?? now), type: 'opening', cashboxId: box.id, amount: openingBalance, createdBy: String(input.createdBy ?? mockUser.id), description: 'رصيد افتتاحي' });
        return { id: box.id };
      },
      createCashTransaction: async (input) => createMockCashTransaction(input),
      audit: async () => runMockAudit(),
      statement: async (args) => cashTransactions.filter((transaction) => !args.cashboxId || transaction.cashbox_id === String(args.cashboxId)),
      transfers: async () => cashTransactions.filter((transaction) => transaction.reference_type === 'cash_transfer'),
      createTransfer: async (input) => createMockCashTransfer(input),
      checks: async () => [],
      createCheck: async () => ({ id: 'mock-check', docNumber: 'CHK-MOCK' }),
      updateCheckStatus: async () => undefined
    },
    imports: {
      previewParties: async () => ({ ready: [], duplicates: [], errors: [] }),
      commitParties: async () => ({ imported: 0, skipped: 0 }),
      previewProducts: async () => ({ ready: [], duplicates: [], errors: [] }),
      commitProducts: async () => ({ imported: 0, skipped: 0 }),
      previewEmployees: async () => ({ ready: [], duplicates: [], errors: [] }),
      commitEmployees: async () => ({ imported: 0, skipped: 0 }),
    },
    accounting: {
      accounts: async () => accounts.map((account) => ({ ...account })),
      createAccount: async (input) => createMockAccount(input),
      journals: async (input = {}) => mockJournalRows(input),
      createJournal: async (input) => createMockJournal(input),
      reverseJournal: async (input) => reverseMockJournal(input),
      ledger: async (input) => mockLedger(input),
      trialBalance: async (input = {}) => mockTrialBalance(input),
      profitLoss: async (input = {}) => mockProfitLoss(input),
      balanceSheet: async (input = {}) => ({ asOf: input?.asOf ?? now, assets: [], liabilities: [], equity: [], currentProfit: 0, totalAssets: 0, totalLiabilities: 0, totalEquity: 0, isBalanced: true }),
      fiscalPeriods: async () => [{ id: 'fp-1', name: 'السنة المالية 2025', start_date: '2025-01-01', end_date: '2025-12-31', is_closed: false, closed_at: null }],
      createFiscalPeriod: async () => ({ id: 'fp-new' }),
      closeFiscalPeriod: async () => undefined,
      openingBalances: {
        list: async () => [],
        set: async () => ({ id: 'ob-new' }),
      },
    },
    employees: {
      list: async () => employees.map((employee) => ({ ...employee })),
      create: async (input) => createMockEmployee(input),
      attendance: async (args) => attendanceRecords.filter((record) => !args?.month || record.date.startsWith(args.month)).map((record) => ({ ...record })),
      recordAttendance: async (input) => { createMockAttendance(input); },
      advances: async (args) => employeeAdvances.filter((advance) => !args?.employeeId || advance.employee_id === args.employeeId).map((advance) => ({ ...advance })),
      createAdvance: async (input) => createMockAdvance(input),
      salaries: async (args) => salaryRecords.filter((salary) => !args?.month || salary.month.startsWith(args.month)).map((salary) => ({ ...salary })),
      createSalary: async (input) => createMockSalary(input),
      recordDeduction: async (input) => createMockDeduction(input),
      paySalary: async (input) => payMockSalary(input),
    },
    dashboard: { summary: async (): Promise<DashboardSummary> => ({ asOf: now, cashOnHand: 125000, receivables: 48000, payables: 22000, stockValue: products.reduce((sum, product) => sum + product.total_value, 0), lowStockCount: products.filter((product) => product.is_low_stock).length, monthProfit: 34000 }) },
    backups: { list: async () => [], restore: async () => ({ restarting: false }) },
  },
};

export function getMockDesktopApi(): DesktopApi {
  return mockApi;
}
