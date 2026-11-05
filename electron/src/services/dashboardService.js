const { assertIsoDate } = require('../domain/money');
const { trialBalance, profitAndLoss } = require('./accountingService');
const { listCashboxes } = require('./treasuryService');
const { listProducts } = require('./inventoryService');

function accountBalance(rows, accountId) {
  const row = rows.find((r) => r.id === accountId);
  return row ? row.debit - row.credit : 0;
}

// كل الأرقام بالقروش، والذمم الدائنة تُعرض موجبة
function dashboardSummary(db, { asOf }) {
  const date = assertIsoDate(asOf, 'تاريخ اليوم');
  const monthStart = `${date.slice(0, 7)}-01`;
  const rows = trialBalance(db, { dateTo: date }).rows;
  const products = listProducts(db);
  const profit = profitAndLoss(db, { dateFrom: monthStart, dateTo: date });
  const sumOf = (sql) => db.prepare(sql).get().total;
  const revenues = rows.filter((r) => r.type === 'revenue').reduce((s, r) => s + (r.credit - r.debit), 0);
  const expenses = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + (r.debit - r.credit), 0);
  const stockValue = products.reduce((sum, product) => sum + product.total_value, 0);
  return {
    asOf: date,
    cashOnHand: listCashboxes(db).filter((box) => box.is_active).reduce((sum, box) => sum + box.balance, 0),
    receivables: accountBalance(rows, 'acc_ar'),
    payables: 0 - accountBalance(rows, 'acc_ap'),
    stockValue,
    lowStockCount: products.filter((product) => product.is_low_stock).length,
    monthProfit: profit.netProfit,
    totalRevenues: revenues,
    totalExpenses: expenses,
    netProfit: revenues - expenses,
    totalSales: sumOf(`SELECT COALESCE(SUM(total), 0) AS total FROM invoices WHERE doc_type = 'sales' AND status = 'posted'`),
    totalPurchases: sumOf(`SELECT COALESCE(SUM(total), 0) AS total FROM invoices WHERE doc_type = 'purchase' AND status = 'posted'`),
    inventoryValue: stockValue,
    salariesDue: sumOf(`SELECT COALESCE(SUM(net_salary), 0) AS total FROM salary_records WHERE status = 'pending'`),
    advancesDue: sumOf(`SELECT COALESCE(SUM(remaining), 0) AS total FROM employee_advances WHERE status = 'active'`),
    checksDue: sumOf(`SELECT COALESCE(SUM(amount), 0) AS total FROM checks WHERE status IN ('received', 'issued', 'due')`),
  };
}

module.exports = { dashboardSummary };
