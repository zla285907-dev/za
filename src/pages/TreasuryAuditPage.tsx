import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, RefreshCw, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, Link2, Link2Off, BookOpen, Wallet, Lightbulb } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Badge from '@/components/ui/Badge';
import { formatEGP } from '@/lib/format';
import { toEgp } from '@/db/db';
import { runTreasuryAudit, type AuditReport } from '@/services/treasuryAuditService';

export default function TreasuryAuditPage() {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await runTreasuryAudit();
      setReport(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء المراجعة');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalDiffEgp = report ? toEgp(report.totalDifference) : 0;
  const storedVsJournalEgp = report ? toEgp(report.storedVsJournalDifference) : 0;
  const hasIssues = report && (report.totalDifference !== 0 || report.storedVsJournalDifference !== 0 || report.unlinkedTransactions.length > 0 || report.cashboxes.some((cb) => cb.balanceColumn !== cb.computedBalance || cb.cashboxVsAccountDiff !== 0));

  return (
    <div>
      <PageHeader
        title="مراجعة ومطابقة أرصدة الخزائن"
        subtitle="تقرير محاسبي للقراءة فقط — لا يتم تعديل أي بيانات"
        icon={ShieldCheck}
        actions={
          <button onClick={load} disabled={loading} className="btn-secondary">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            تحديث التقرير
          </button>
        }
      />

      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">هذه المراجعة للقراءة فقط</p>
            <p>لا يتم تعديل أي رصيد أو إنشاء قيود تصحيحية أو حذف حركات. التقرير يقارن أرصدة الخزائن بالأرصدة المحاسبية المقابلة لها ويحدد الفروقات وأسبابها المحتملة.</p>
          </div>
        </div>
      </div>

      {loading && !report ? (
        <p className="text-sm text-slate-400 text-center py-8">جارٍ تجميع بيانات المراجعة...</p>
      ) : error ? (
        <div className="card p-6 text-center">
          <AlertTriangle className="h-10 w-10 text-rose-400 mx-auto mb-3" />
          <p className="text-sm text-rose-600">{error}</p>
        </div>
      ) : report ? (
        <div className="space-y-6">
          {/* بطاقات الملخص */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard icon={Wallet} label="إجمالي أرصدة الخزائن" value={formatEGP(toEgp(report.totalCashboxBalance))} tone="blue" />
            <SummaryCard icon={BookOpen} label="إجمالي الرصيد المحاسبي" value={formatEGP(toEgp(report.totalAccountBalance))} tone="emerald" />
            <SummaryCard
              icon={AlertTriangle}
              label="إجمالي الفرق"
              value={formatEGP(Math.abs(totalDiffEgp))}
              tone={totalDiffEgp === 0 ? 'emerald' : 'rose'}
              suffix={totalDiffEgp > 0 ? '(زائد للخزائن)' : totalDiffEgp < 0 ? '(ناقص للخزائن)' : ''}
            />
            <SummaryCard
              icon={Link2Off}
              label="حركات غير مرتبطة"
              value={String(report.unlinkedTransactions.length)}
              tone={report.unlinkedTransactions.length === 0 ? 'emerald' : 'amber'}
            />
          </div>

          {/* حالة التطابق */}
          <div className={`rounded-xl border px-5 py-4 ${hasIssues ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className="flex items-center gap-3">
              {hasIssues ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
                  <p className="text-sm font-semibold text-rose-800">توجد فروقات تستوجب المراجعة — راجع التفاصيل بالأسفل</p>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <p className="text-sm font-semibold text-emerald-800">جميع الأرصدة متطابقة — لا توجد فروقات</p>
                </>
              )}
            </div>
          </div>

          {/* جدول: تفاصيل كل خزينة */}
          <div className="card overflow-hidden">
            <h3 className="font-bold text-slate-800 p-4 border-b border-slate-100">تفاصيل أرصدة الخزائن والحسابات المرتبطة</h3>
            {report.cashboxes.length === 0 ? (
              <EmptyState icon={Wallet} title="لا توجد خزائن" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60 text-slate-500">
                      <th className="px-4 py-3 text-right font-semibold">الخزينة</th>
                      <th className="px-4 py-3 text-right font-semibold">الحساب المرتبط</th>
                      <th className="px-4 py-3 text-right font-semibold">الرصيد الافتتاحي</th>
                      <th className="px-4 py-3 text-right font-semibold">الرصيد المخزّن</th>
                      <th className="px-4 py-3 text-right font-semibold">المحسوب من الحركات</th>
                      <th className="px-4 py-3 text-right font-semibold">رصيد الحساب (من القيود)</th>
                      <th className="px-4 py-3 text-right font-semibold">فرق خزينة/حساب</th>
                      <th className="px-4 py-3 text-right font-semibold">حركات</th>
                      <th className="px-4 py-3 text-right font-semibold">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.cashboxes.map((cb) => {
                      const storedVsComputed = cb.balanceColumn - cb.computedBalance;
                      return (
                        <tr key={cb.cashboxId} className="border-b border-slate-50 last:border-0">
                          <td className="px-4 py-3 text-slate-700 font-medium">
                            {cb.cashboxName}
                            {!cb.isActive && <Badge tone="slate"> غير مفعّلة</Badge>}
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs">
                            {cb.accountCode ? (
                              <span className="font-mono">{cb.accountCode} — {cb.accountName}</span>
                            ) : (
                              <Badge tone="amber">غير مربوط</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 num text-slate-600">{formatEGP(toEgp(cb.openingBalance))}</td>
                          <td className="px-4 py-3 num text-slate-700 font-semibold">{formatEGP(toEgp(cb.balanceColumn))}</td>
                          <td className="px-4 py-3 num text-slate-600">{formatEGP(toEgp(cb.computedBalance))}</td>
                          <td className="px-4 py-3 num text-slate-600">{formatEGP(toEgp(cb.accountJournalBalance))}</td>
                          <td className="px-4 py-3 num">
                            {cb.cashboxVsAccountDiff === 0 ? (
                              <span className="text-emerald-600">متطابق</span>
                            ) : (
                              <span className="text-rose-600 font-semibold">{formatEGP(Math.abs(toEgp(cb.cashboxVsAccountDiff)))}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 num text-slate-500 text-xs">
                            <span className="inline-flex items-center gap-1">
                              <Link2 className="h-3 w-3 text-emerald-500" />{cb.linkedCount}
                              {cb.unlinkedCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-amber-600 mr-1">
                                  <Link2Off className="h-3 w-3" />{cb.unlinkedCount}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {storedVsComputed === 0 && cb.cashboxVsAccountDiff === 0 ? (
                              <Badge tone="emerald" dot>متطابق</Badge>
                            ) : (
                              <Badge tone="rose" dot>فرق</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* جدول: الأرصدة المحاسبية */}
          <div className="card overflow-hidden">
            <h3 className="font-bold text-slate-800 p-4 border-b border-slate-100">الأرصدة المحاسبية للحسابات المرتبطة بالخزائن</h3>
            {report.accounts.length === 0 ? (
              <EmptyState icon={BookOpen} title="لا توجد حسابات مرتبطة" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60 text-slate-500">
                      <th className="px-4 py-3 text-right font-semibold">الكود</th>
                      <th className="px-4 py-3 text-right font-semibold">الحساب</th>
                      <th className="px-4 py-3 text-right font-semibold">الرصيد المخزّن</th>
                      <th className="px-4 py-3 text-right font-semibold">المحسوب من القيود</th>
                      <th className="px-4 py-3 text-right font-semibold">عدد القيود</th>
                      <th className="px-4 py-3 text-right font-semibold">الفرق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.accounts.map((acc) => {
                      const diff = acc.storedBalance - acc.journalBalance;
                      return (
                        <tr key={acc.accountId} className="border-b border-slate-50 last:border-0">
                          <td className="px-4 py-3 font-mono num text-slate-500">{acc.accountCode}</td>
                          <td className="px-4 py-3 text-slate-700">{acc.accountName}</td>
                          <td className="px-4 py-3 num text-slate-700 font-semibold">{formatEGP(toEgp(acc.storedBalance))}</td>
                          <td className="px-4 py-3 num text-slate-600">{formatEGP(toEgp(acc.journalBalance))}</td>
                          <td className="px-4 py-3 num text-slate-500">{acc.entryCount}</td>
                          <td className="px-4 py-3 num">
                            {diff === 0 ? (
                              <Badge tone="emerald" dot>متطابق</Badge>
                            ) : (
                              <Badge tone="rose" dot>{formatEGP(Math.abs(toEgp(diff)))}</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* الحركات غير المرتبطة */}
          {report.unlinkedTransactions.length > 0 && (
            <div className="card overflow-hidden">
              <h3 className="font-bold text-slate-800 p-4 border-b border-slate-100">
                حركات خزينة غير مرتبطة بقيود محاسبية
                <span className="mr-2 text-amber-600 text-sm font-normal">({report.unlinkedTransactions.length})</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60 text-slate-500">
                      <th className="px-4 py-3 text-right font-semibold">المستند</th>
                      <th className="px-4 py-3 text-right font-semibold">التاريخ</th>
                      <th className="px-4 py-3 text-right font-semibold">الخزينة</th>
                      <th className="px-4 py-3 text-right font-semibold">النوع</th>
                      <th className="px-4 py-3 text-right font-semibold">البيان</th>
                      <th className="px-4 py-3 text-right font-semibold">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.unlinkedTransactions.map((t) => {
                      const isIn = ['receipt', 'deposit', 'opening'].includes(t.type);
                      return (
                        <tr key={t.id} className="border-b border-slate-50 last:border-0">
                          <td className="px-4 py-3 font-mono text-slate-500 text-xs">{t.doc_number}</td>
                          <td className="px-4 py-3 num text-slate-600">{t.date}</td>
                          <td className="px-4 py-3 text-slate-600">{t.cashbox_name}</td>
                          <td className="px-4 py-3"><Badge tone={isIn ? 'emerald' : 'rose'}>{t.type}</Badge></td>
                          <td className="px-4 py-3 text-slate-600">{t.description ?? '—'}</td>
                          <td className={`px-4 py-3 num font-semibold ${isIn ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {isIn ? '+' : '−'}{formatEGP(toEgp(t.amount))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* التحويلات بين الخزائن */}
          {report.transfers.length > 0 && (
            <div className="card overflow-hidden">
              <h3 className="font-bold text-slate-800 p-4 border-b border-slate-100">
                التحويلات بين الخزائن
                <span className="mr-2 text-slate-500 text-sm font-normal">({report.transfers.length})</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60 text-slate-500">
                      <th className="px-4 py-3 text-right font-semibold">المستند</th>
                      <th className="px-4 py-3 text-right font-semibold">التاريخ</th>
                      <th className="px-4 py-3 text-right font-semibold">من خزينة</th>
                      <th className="px-4 py-3 text-right font-semibold">إلى خزينة</th>
                      <th className="px-4 py-3 text-right font-semibold">المبلغ</th>
                      <th className="px-4 py-3 text-right font-semibold">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.transfers.map((t) => (
                      <tr key={t.docNumber} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-3 font-mono text-slate-500 text-xs">{t.docNumber}</td>
                        <td className="px-4 py-3 num text-slate-600">{t.date}</td>
                        <td className="px-4 py-3 text-slate-600">{t.fromCashboxName}</td>
                        <td className="px-4 py-3 text-slate-600">{t.toCashboxName}</td>
                        <td className="px-4 py-3 num font-semibold text-slate-700">{formatEGP(toEgp(t.amount))}</td>
                        <td className="px-4 py-3">
                          {t.consistent
                            ? <Badge tone="emerald" dot>متسق</Badge>
                            : <Badge tone="rose" dot>غير متسق</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ملخص الفروقات الإجمالية */}
          <div className="card p-6">
            <h3 className="font-bold text-slate-800 mb-4">ملخص الفروقات الإجمالية</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-slate-600">إجمالي أرصدة الخزائن (المخزّن)</span>
                <span className="num font-semibold text-slate-800">{formatEGP(toEgp(report.totalCashboxBalance))}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-slate-600">إجمالي الرصيد المحاسبي المقابل (من القيود — بدون ازدواج)</span>
                <span className="num font-semibold text-slate-800">{formatEGP(toEgp(report.totalAccountBalance))}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-slate-600">فرق الأرصدة المخزّنة vs المحسوبة من القيود (كل الحسابات المرتبطة)</span>
                <span className={`num font-semibold ${storedVsJournalEgp === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {storedVsJournalEgp === 0 ? 'متطابق' : `${storedVsJournalEgp > 0 ? '+' : ''}${formatEGP(storedVsJournalEgp)}`}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 bg-slate-50 -mx-6 px-6 border-t-2 border-slate-200">
                <span className="font-bold text-slate-800">إجمالي الفرق النهائي</span>
                <span className={`num font-bold text-base ${totalDiffEgp === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {totalDiffEgp === 0 ? 'متطابق — لا يوجد فرق' : `${totalDiffEgp > 0 ? '+' : ''}${formatEGP(totalDiffEgp)}`}
                </span>
              </div>
            </div>
          </div>

          {/* المعالجة المحاسبية المقترحة */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              <h3 className="font-bold text-slate-800">المعالجة المحاسبية المقترحة</h3>
            </div>
            <div className="space-y-3">
              {report.suggestedTreatment.map((s, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg bg-amber-50/50 border border-amber-100 px-4 py-3">
                  <span className="text-amber-600 font-bold text-sm shrink-0">{i + 1}.</span>
                  <p className="text-sm text-slate-700 leading-relaxed">{s}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-500 leading-relaxed">
                ملاحظة: هذه المقترحات للمراجعة فقط ولم يتم تنفيذ أي منها. يجب الحصول على موافقة المسؤول قبل اتخاذ أي إجراء محاسبي.
              </p>
            </div>
          </div>
        </div>
      ) : !loading ? (
        <EmptyState icon={ShieldCheck} title="لا توجد بيانات" description="اضغط تحديث التقرير لبدء المراجعة" />
      ) : null}
    </div>
  );
}

function SummaryCard({
  icon: Icon, label, value, tone, suffix,
}: {
  icon: typeof Wallet; label: string; value: string;
  tone: 'blue' | 'emerald' | 'rose' | 'amber'; suffix?: string;
}) {
  const tones: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  const iconTones: Record<string, string> = {
    blue: 'text-blue-500', emerald: 'text-emerald-500', rose: 'text-rose-500', amber: 'text-amber-500',
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className={`h-5 w-5 ${iconTones[tone]}`} />
      </div>
      <p className="text-xs font-medium opacity-80 mb-1">{label}</p>
      <p className="num text-lg font-bold">{value}</p>
      {suffix && <p className="text-xs mt-0.5 opacity-70">{suffix}</p>}
    </div>
  );
}
