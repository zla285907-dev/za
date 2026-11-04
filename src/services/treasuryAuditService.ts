import { getDb, toEgp } from '@/db/db';
import { isElectronAvailable, getDesktopApi } from '@/lib/electronBridge';
import { listCashboxes, type Cashbox } from './treasuryService';
import { listAccounts, type Account } from './accountingService';

export interface CashboxAuditRow {
  cashboxId: string;
  cashboxName: string;
  isActive: boolean;
  openingBalance: number;          // قرش
  balanceColumn: number;            // قرش — من عمود balance المخزّن
  computedBalance: number;          // قرش — opening_balance + حركات (بدون type='opening')
  transactionCount: number;
  linkedCount: number;              // حركات لها journal_entry_id
  unlinkedCount: number;            // حركات بدون journal_entry_id
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
  accountJournalBalance: number;    // قرش — رصيد الحساب من القيود المرحّبة
  accountStoredBalance: number;     // قرش — رصيد الحساب المخزّن
  cashboxVsAccountDiff: number;     // قرش
}

export interface AccountAuditRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  storedBalance: number;            // قرش
  journalBalance: number;           // قرش
  entryCount: number;
}

export interface TransferPair {
  docNumber: string;
  date: string;
  amount: number;            // قرش
  fromCashboxId: string;
  fromCashboxName: string;
  toCashboxId: string;
  toCashboxName: string;
  consistent: boolean;
}

export interface AuditReport {
  cashboxes: CashboxAuditRow[];
  accounts: AccountAuditRow[];
  totalCashboxBalance: number;
  totalAccountBalance: number;
  totalDifference: number;
  storedVsJournalDifference: number;
  unlinkedTransactions: Array<{
    id: string;
    doc_number: string;
    date: string;
    type: string;
    cashbox_id: string;
    cashbox_name: string;
    amount: number;
    description: string | null;
    journal_entry_id: string | null;
  }>;
  transfers: TransferPair[];
  suggestedTreatment: string[];
}

const POSTED_STATUSES = "('posted','reversed')";

export async function runTreasuryAudit(): Promise<AuditReport> {
  if (!isElectronAvailable()) {
    return runPgliteAudit();
  }
  return runElectronAudit();
}

// ───────────────── مسار PGlite (المتصفح) ─────────────────

async function runPgliteAudit(): Promise<AuditReport> {
  const db = await getDb();

  const cashboxRows = await db.query<Cashbox>(
    'SELECT id, name, opening_balance, balance, is_active, account_id FROM cashboxes ORDER BY name'
  );

  const linkedAccountIds = new Set<string>();
  for (const cb of cashboxRows.rows) {
    if (cb.account_id) linkedAccountIds.add(cb.account_id);
  }

  const cashboxAudit: CashboxAuditRow[] = [];
  for (const cb of cashboxRows.rows) {
    // الرصيد المحسوب = opening_balance (مرة واحدة) + حركات غير الافتتاحية
    // إذا لم يوجد opening_balance ولكن توجد حركة افتتاحية، تُحسب الحركة
    const txRes = await db.query<{ net: number; cnt: number; linked: number }>(
      `SELECT
         COALESCE(SUM(
           CASE WHEN t.type IN ('receipt','deposit') THEN t.amount
                WHEN t.type IN ('payment','withdrawal') THEN -t.amount
                ELSE 0 END
         ), 0) AS net,
         COUNT(*) AS cnt,
         COUNT(t.journal_entry_id) AS linked
       FROM cash_transactions t
       WHERE t.cashbox_id = $1 AND t.type != 'opening'`,
      [cb.id]
    );
    const openingRes = await db.query<{ amount: number }>(
      `SELECT amount FROM cash_transactions WHERE cashbox_id = $1 AND type = 'opening' LIMIT 1`,
      [cb.id]
    );
    const openingBalance = Number(cb.opening_balance);
    const openingTxAmount = openingRes.rows.length > 0 ? Number(openingRes.rows[0].amount) : 0;
    const r = txRes.rows[0];
    const computedBalance = openingBalance
      + (openingBalance === 0 ? openingTxAmount : 0)
      + Number(r.net);

    let accountJournalBalance = 0;
    let accountStoredBalance = 0;
    let accountCode: string | null = null;
    let accountName: string | null = null;
    if (cb.account_id) {
      const accRes = await db.query<{ code: string; name: string; balance: number }>(
        'SELECT code, name, balance FROM accounts WHERE id = $1',
        [cb.account_id]
      );
      if (accRes.rows.length > 0) {
        accountCode = accRes.rows[0].code;
        accountName = accRes.rows[0].name;
        accountStoredBalance = accRes.rows[0].balance;
      }
      const jrRes = await db.query<{ bal: number }>(
        `SELECT COALESCE(SUM(l.debit - l.credit), 0) AS bal
         FROM journal_lines l
         JOIN journal_entries e ON l.entry_id = e.id
         WHERE l.account_id = $1 AND e.status IN ${POSTED_STATUSES}`,
        [cb.account_id]
      );
      accountJournalBalance = Number(jrRes.rows[0].bal);
    }

    cashboxAudit.push({
      cashboxId: cb.id,
      cashboxName: cb.name,
      isActive: cb.is_active,
      openingBalance: cb.opening_balance,
      balanceColumn: cb.balance,
      computedBalance,
      transactionCount: Number(r.cnt),
      linkedCount: Number(r.linked),
      unlinkedCount: Number(r.cnt) - Number(r.linked),
      accountId: cb.account_id,
      accountCode,
      accountName,
      accountJournalBalance,
      accountStoredBalance,
      cashboxVsAccountDiff: cb.balance - accountJournalBalance,
    });
  }

  const accountAudit: AccountAuditRow[] = [];
  for (const accId of linkedAccountIds) {
    const accRes = await db.query<{ code: string; name: string; balance: number }>(
      'SELECT code, name, balance FROM accounts WHERE id = $1', [accId]
    );
    if (accRes.rows.length === 0) continue;
    const jrRes = await db.query<{ bal: number; cnt: number }>(
      `SELECT COALESCE(SUM(l.debit - l.credit), 0) AS bal, COUNT(*) AS cnt
       FROM journal_lines l
       JOIN journal_entries e ON l.entry_id = e.id
       WHERE l.account_id = $1 AND e.status IN ${POSTED_STATUSES}`,
      [accId]
    );
    accountAudit.push({
      accountId: accId,
      accountCode: accRes.rows[0].code,
      accountName: accRes.rows[0].name,
      storedBalance: accRes.rows[0].balance,
      journalBalance: Number(jrRes.rows[0].bal),
      entryCount: Number(jrRes.rows[0].cnt),
    });
  }

  const unlinkedRes = await db.query<{
    id: string; doc_number: string; date: string; type: string;
    cashbox_id: string; cashbox_name: string; amount: number;
    description: string | null; journal_entry_id: string | null;
  }>(
    `SELECT t.id, t.doc_number, t.date::text, t.type, t.cashbox_id,
            cb.name AS cashbox_name, t.amount, t.description, t.journal_entry_id
     FROM cash_transactions t
     JOIN cashboxes cb ON t.cashbox_id = cb.id
     WHERE t.journal_entry_id IS NULL
     ORDER BY t.date DESC, t.doc_number DESC`
  );

  // The browser schema records no transfer metadata on cash transactions, so no transfers can be identified here.
  const transfers: TransferPair[] = [];

  const totalCashboxBalance = cashboxAudit.reduce((s, r) => s + r.balanceColumn, 0);
  const totalAccountBalance = accountAudit.reduce((s, r) => s + r.journalBalance, 0);
  const totalDifference = totalCashboxBalance - totalAccountBalance;
  const storedVsJournalDifference = accountAudit.reduce((s, r) => s + (r.storedBalance - r.journalBalance), 0);

  const suggestedTreatment = buildSuggestions(
    cashboxAudit, accountAudit, totalDifference, storedVsJournalDifference,
    unlinkedRes.rows.length, transfers
  );

  return {
    cashboxes: cashboxAudit,
    accounts: accountAudit,
    totalCashboxBalance,
    totalAccountBalance,
    totalDifference,
    storedVsJournalDifference,
    unlinkedTransactions: unlinkedRes.rows.map((r) => ({ ...r })),
    transfers,
    suggestedTreatment,
  };
}

// ───────────────── مسار Electron ─────────────────
// في Electron، المراجعة تُحسب بالكامل في العملية الرئيسية عبر IPC
// للحصول على رصيد القيود من journal_lines مباشرةً (وليس من رصيد مخزّن)

async function runElectronAudit(): Promise<AuditReport> {
  const api = getDesktopApi();
  if (api.farm.treasury.audit) {
    const report = await api.farm.treasury.audit() as AuditReport;
    return report;
  }

  // مسار احتياطي للمعاينة إذا لم تتوفر قناة audit
  const cashboxes = await listCashboxes();
  const accounts = await listAccounts();
  const transactions = api.farm.treasury.listTransactions
    ? await api.farm.treasury.listTransactions(1000)
    : [];

  let trialBalanceMap: Map<string, { debit: number; credit: number }> = new Map();
  try {
    const tb = await api.farm.accounting.trialBalance() as Array<{
      account_id: string; code: string; name: string; type: string; debit: number; credit: number;
    }>;
    trialBalanceMap = new Map(tb.map((r) => [r.account_id, { debit: r.debit, credit: r.credit }]));
  } catch { /* fallback */ }

  const accountMap = new Map<string, Account>();
  for (const a of accounts) accountMap.set(a.id, a);

  const linkedAccountIds = new Set<string>();
  for (const cb of cashboxes) {
    if (cb.account_id) linkedAccountIds.add(cb.account_id);
  }

  const cashboxAudit: CashboxAuditRow[] = cashboxes.map((cb) => {
    const boxTx = transactions.filter((t) => t.cashbox_id === cb.id);
    const inflow = boxTx.filter((t) => ['receipt', 'deposit'].includes(t.type)).reduce((s, t) => s + t.amount, 0);
    const outflow = boxTx.filter((t) => ['payment', 'withdrawal'].includes(t.type)).reduce((s, t) => s + t.amount, 0);
    const linked = boxTx.filter((t) => (t as { journal_entry_id?: string | null }).journal_entry_id).length;

    let accountCode: string | null = null;
    let accountName: string | null = null;
    let accountJournalBalance = 0;
    let accountStoredBalance = 0;
    if (cb.account_id) {
      const acc = accountMap.get(cb.account_id);
      if (acc) {
        accountCode = acc.code;
        accountName = acc.name;
        accountStoredBalance = acc.balance;
        const tbRow = trialBalanceMap.get(cb.account_id);
        accountJournalBalance = tbRow ? (tbRow.debit - tbRow.credit) : acc.balance;
      }
    }

    return {
      cashboxId: cb.id,
      cashboxName: cb.name,
      isActive: cb.is_active,
      openingBalance: cb.opening_balance,
      balanceColumn: cb.balance,
      computedBalance: cb.opening_balance + inflow - outflow,
      transactionCount: boxTx.length,
      linkedCount: linked,
      unlinkedCount: boxTx.length - linked,
      accountId: cb.account_id ?? null,
      accountCode,
      accountName,
      accountJournalBalance,
      accountStoredBalance,
      cashboxVsAccountDiff: cb.balance - accountJournalBalance,
    };
  });

  const accountAudit: AccountAuditRow[] = [];
  for (const accId of linkedAccountIds) {
    const acc = accountMap.get(accId);
    if (!acc) continue;
    const tbRow = trialBalanceMap.get(accId);
    const journalBalance = tbRow ? (tbRow.debit - tbRow.credit) : acc.balance;
    accountAudit.push({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      storedBalance: acc.balance,
      journalBalance,
      entryCount: 0,
    });
  }

  const totalCashboxBalance = cashboxAudit.reduce((s, r) => s + r.balanceColumn, 0);
  const totalAccountBalance = accountAudit.reduce((s, r) => s + r.journalBalance, 0);
  const totalDifference = totalCashboxBalance - totalAccountBalance;
  const storedVsJournalDifference = accountAudit.reduce((s, r) => s + (r.storedBalance - r.journalBalance), 0);

  return {
    cashboxes: cashboxAudit,
    accounts: accountAudit,
    totalCashboxBalance,
    totalAccountBalance,
    totalDifference,
    storedVsJournalDifference,
    unlinkedTransactions: transactions
      .filter((t) => !(t as { journal_entry_id?: string | null }).journal_entry_id)
      .map((t) => {
        const box = cashboxes.find((cb) => cb.id === t.cashbox_id);
        return {
          id: t.id, doc_number: t.doc_number, date: t.date, type: t.type,
          cashbox_id: t.cashbox_id, cashbox_name: box?.name ?? '—',
          amount: t.amount, description: t.description, journal_entry_id: null,
        };
      }),
    transfers: [],
    suggestedTreatment: buildSuggestions(cashboxAudit, accountAudit, totalDifference, storedVsJournalDifference, 0, []),
  };
}

// ───────────────── المقترحات ─────────────────

function buildSuggestions(
  cashboxes: CashboxAuditRow[],
  accounts: AccountAuditRow[],
  totalDiff: number,
  storedVsJournal: number,
  unlinkedCount: number,
  transfers: TransferPair[]
): string[] {
  const suggestions: string[] = [];
  const inconsistentTransfers = transfers.filter((t) => !t.consistent);

  if (totalDiff === 0 && storedVsJournal === 0 && unlinkedCount === 0 && inconsistentTransfers.length === 0) {
    const allMatched = cashboxes.every((cb) => cb.balanceColumn === cb.computedBalance && cb.cashboxVsAccountDiff === 0);
    if (allMatched) {
      suggestions.push('الأرصدة متطابقة تمامًا — لا توجد فروقات تستوجب معالجة.');
      return suggestions;
    }
  }

  if (unlinkedCount > 0) {
    suggestions.push(
      `يوجد ${unlinkedCount} حركة خزينة غير مرتبطة بقيد محاسبي. يجب إنشاء قيود محاسبية ربط لها (مدين/دائن مقابل حساب الخزينة المرتبط) بعد مراجعة كل حركة للتأكد من أنها لم تُرحّل في النظام القديم.`
    );
  }

  if (storedVsJournal !== 0) {
    suggestions.push(
      `إجمالي الفرق بين الأرصدة المخزّنة في جدول الحسابات والمحسوبة من القيود المرحّبة يساوي ${toEgp(storedVsJournal).toFixed(2)} ج.م. يُنصح بإعادة احتساب أرصدة الحسابات من القيود المرحّبة ومراجعة سبب الانحراف.`
    );
  }

  const balanceVsComputed = cashboxes.filter((cb) => cb.balanceColumn !== cb.computedBalance);
  if (balanceVsComputed.length > 0) {
    suggestions.push(
      `يوجد ${balanceVsComputed.length} خزينة بها فرق بين الرصيد المخزّن والمحسوب من الحركات. قد يكون السبب حركات تسوية يدوية أو أخطاء ترحيل. يُنصح بإعادة احتساب رصيد الخزينة من جدول cash_transactions.`
    );
  }

  const cashboxAccountDiff = cashboxes.filter((cb) => cb.cashboxVsAccountDiff !== 0);
  if (cashboxAccountDiff.length > 0) {
    suggestions.push(
      `يوجد ${cashboxAccountDiff.length} خزينة بها فرق بين رصيدها المخزّن ورصيد حسابها المحاسبي المحسوب من القيود. قد يكون السبب: حركات خزينة دون قيد محاسبي، أو قيود على حساب النقدية دون حركة خزينة مقابلة، أو أرصدة افتتاحية غير متطابقة.`
    );
  }

  if (inconsistentTransfers.length > 0) {
    suggestions.push(
      `يوجد ${inconsistentTransfers.length} تحويل بين الخزائن غير متسق. قد يكون المبلغ مختلف بين الطرفين، أو أحد الطرفين غير مرتبط بقيد محاسبي. يجب مراجعة هذه التحويلات.`
    );
  }

  if (totalDiff !== 0) {
    suggestions.push(
      `إجمالي الفرق بين أرصدة الخزائن والحسابات المحاسبية المرتبطة يساوي ${toEgp(totalDiff).toFixed(2)} ج.م. يُنصح بمراجعة القيود الافتتاحية وحركات التحويل التاريخية قبل اتخاذ أي معالجة.`
    );
  }

  return suggestions;
}
