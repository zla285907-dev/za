const { UserFacingError } = require('../errors');

const POSTED_STATUSES = "('posted','reversed')";

/**
 * Treasury audit — READ-ONLY.
 * Computes journal balances from journal_lines + journal_entries directly,
 * handles reversed entries correctly (reversed originals excluded,
 * reversing entries included), and compares with stored/cashbox balances.
 */

function cashboxBalanceSql() {
  return `
    SELECT b.id, b.name, b.account_id, b.opening_balance, b.is_active,
      b.opening_balance
        + COALESCE((SELECT SUM(CASE WHEN t.direction = 'in' THEN t.amount ELSE -t.amount END)
                    FROM cash_transactions t WHERE t.cashbox_id = b.id AND t.type != 'opening'), 0)
        + COALESCE((SELECT CASE WHEN b.opening_balance = 0 THEN t.amount ELSE 0 END
                    FROM cash_transactions t WHERE t.cashbox_id = b.id AND t.type = 'opening' LIMIT 1), 0)
      AS balance
    FROM cashboxes b
  `;
}

function journalBalanceForAccount(db, accountId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(l.debit - l.credit), 0) AS bal, COUNT(*) AS cnt
    FROM journal_lines l
    JOIN journal_entries e ON l.entry_id = e.id
    WHERE l.account_id = ? AND e.status IN ${POSTED_STATUSES}
  `).get(accountId);
  return { balance: row.bal, entryCount: row.cnt };
}

function runAudit(db) {
  const cashboxes = db.prepare(`${cashboxBalanceSql()} ORDER BY b.name`).all()
    .map((row) => ({ ...row, is_active: row.is_active === 1 }));

  const accountAudit = [];
  const linkedAccountIds = new Set();
  for (const cb of cashboxes) {
    if (cb.account_id) linkedAccountIds.add(cb.account_id);
  }

  const cashboxAudit = cashboxes.map((cb) => {
    const txRows = db.prepare(`
      SELECT t.id, t.doc_number, t.date, t.type, t.direction, t.amount, t.journal_entry_id,
             t.description, t.source_type, t.source_id
      FROM cash_transactions t
      WHERE t.cashbox_id = ?
      ORDER BY t.date, t.doc_number
    `).all(cb.id);

    const linked = txRows.filter((t) => t.journal_entry_id).length;
    const unlinked = txRows.filter((t) => !t.journal_entry_id);

    let accountCode = null;
    let accountName = null;
    let accountJournalBalance = 0;
    let accountStoredBalance = 0;
    let entryCount = 0;

    if (cb.account_id) {
      const acc = db.prepare('SELECT code, name FROM accounts WHERE id = ?').get(cb.account_id);
      if (acc) {
        accountCode = acc.code;
        accountName = acc.name;
      }
      const jr = journalBalanceForAccount(db, cb.account_id);
      accountJournalBalance = jr.balance;
      entryCount = jr.entryCount;
      // Electron accounts have no stored balance column — compute from journal
      accountStoredBalance = accountJournalBalance;
    }

    return {
      cashboxId: cb.id,
      cashboxName: cb.name,
      isActive: cb.is_active,
      openingBalance: cb.opening_balance,
      balanceColumn: cb.balance,
      computedBalance: cb.balance,
      transactionCount: txRows.length,
      linkedCount: linked,
      unlinkedCount: unlinked.length,
      accountId: cb.account_id ?? null,
      accountCode,
      accountName,
      accountJournalBalance,
      accountStoredBalance,
      cashboxVsAccountDiff: cb.balance - accountJournalBalance,
      _unlinkedRows: unlinked,
    };
  });

  // Account audit rows (one per linked account, no duplicates)
  for (const accId of linkedAccountIds) {
    const acc = db.prepare('SELECT code, name FROM accounts WHERE id = ?').get(accId);
    if (!acc) continue;
    const jr = journalBalanceForAccount(db, accId);
    accountAudit.push({
      accountId: accId,
      accountCode: acc.code,
      accountName: acc.name,
      storedBalance: jr.balance,
      journalBalance: jr.balance,
      entryCount: jr.entryCount,
    });
  }

  // Unlinked transactions
  const unlinkedTransactions = [];
  for (const cb of cashboxAudit) {
    for (const t of cb._unlinkedRows) {
      unlinkedTransactions.push({
        id: t.id,
        doc_number: t.doc_number,
        date: t.date,
        type: t.type,
        cashbox_id: cb.cashboxId,
        cashbox_name: cb.cashboxName,
        amount: t.amount,
        description: t.description,
        journal_entry_id: null,
      });
    }
  }

  // Inter-cashbox transfer consistency
  // Transfers appear as pairs: a 'withdrawal' from one cashbox and a 'deposit' to another
  // with the same doc_number and amount. They must NOT be classified as income or expense.
  const transferPairs = detectTransfers(db, cashboxes);

  // Clean up internal fields
  const cleanCashboxAudit = cashboxAudit.map(({ _unlinkedRows, ...rest }) => rest);

  const totalCashboxBalance = cleanCashboxAudit.reduce((s, r) => s + r.balanceColumn, 0);
  const totalAccountBalance = accountAudit.reduce((s, r) => s + r.journalBalance, 0);
  const totalDifference = totalCashboxBalance - totalAccountBalance;
  const storedVsJournalDifference = accountAudit.reduce((s, r) => s + (r.storedBalance - r.journalBalance), 0);

  const suggestedTreatment = buildSuggestions(
    cleanCashboxAudit, accountAudit, totalDifference, storedVsJournalDifference,
    unlinkedTransactions.length, transferPairs
  );

  return {
    cashboxes: cleanCashboxAudit,
    accounts: accountAudit,
    totalCashboxBalance,
    totalAccountBalance,
    totalDifference,
    storedVsJournalDifference,
    unlinkedTransactions,
    transfers: transferPairs,
    suggestedTreatment,
  };
}

function detectTransfers(db, cashboxes) {
  const cashboxMap = new Map(cashboxes.map((cb) => [cb.id, cb]));
  // Find withdrawal + deposit pairs with the same doc_number
  const rows = db.prepare(`
    SELECT t.id, t.doc_number, t.date, t.type, t.direction, t.amount, t.cashbox_id,
           t.journal_entry_id, t.source_id
    FROM cash_transactions t
    WHERE t.type IN ('withdrawal', 'deposit')
      AND t.source_type = 'cash_transfer'
    ORDER BY t.date, t.doc_number
  `).all();

  const bySourceId = new Map();
  for (const r of rows) {
    if (!bySourceId.has(r.source_id)) bySourceId.set(r.source_id, []);
    bySourceId.get(r.source_id).push(r);
  }

  const pairs = [];
  for (const [, group] of bySourceId) {
    const docNumber = group[0].doc_number;
    const withdrawals = group.filter((r) => r.type === 'withdrawal');
    const deposits = group.filter((r) => r.type === 'deposit');
    if (withdrawals.length === 1 && deposits.length === 1) {
      const w = withdrawals[0];
      const d = deposits[0];
      const fromBox = cashboxMap.get(w.cashbox_id);
      const toBox = cashboxMap.get(d.cashbox_id);
      pairs.push({
        docNumber,
        date: w.date,
        amount: w.amount,
        fromCashboxId: w.cashbox_id,
        fromCashboxName: fromBox ? fromBox.name : '—',
        toCashboxId: d.cashbox_id,
        toCashboxName: toBox ? toBox.name : '—',
        consistent: w.amount === d.amount && w.cashbox_id !== d.cashbox_id
          && Boolean(w.journal_entry_id) === Boolean(d.journal_entry_id),
      });
    }
  }
  return pairs;
}

function buildSuggestions(cashboxes, accounts, totalDiff, storedVsJournal, unlinkedCount, transfers) {
  const suggestions = [];

  const inconsistentTransfers = transfers.filter((t) => !t.consistent);
  const totalDiffAbs = Math.abs(totalDiff);

  if (totalDiffAbs === 0 && storedVsJournal === 0 && unlinkedCount === 0 && inconsistentTransfers.length === 0) {
    const allMatched = cashboxes.every((cb) => cb.cashboxVsAccountDiff === 0);
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
      `إجمالي الفرق بين الأرصدة المخزّنة في جدول الحسابات والمحسوبة من القيود المرحّبة يساوي ${(storedVsJournal / 100).toFixed(2)} ج.م. يُنصح بإعادة احتساب أرصدة الحسابات من القيود المرحّبة ومراجعة سبب الانحراف.`
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

  if (totalDiffAbs !== 0) {
    suggestions.push(
      `إجمالي الفرق بين أرصدة الخزائن والحسابات المحاسبية المرتبطة يساوي ${(totalDiff / 100).toFixed(2)} ج.م. يُنصح بمراجعة القيود الافتتاحية وحركات التحويل التاريخية قبل اتخاذ أي معالجة.`
    );
  }

  return suggestions;
}

module.exports = { runAudit, journalBalanceForAccount };
