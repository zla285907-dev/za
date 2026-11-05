import { getDb } from '@/db/db';
import { getDesktopApi, isElectronAvailable } from '@/lib/electronBridge';

const desktopAccounting = () => getDesktopApi().farm.accounting;

export interface FiscalPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  closed_at: string | null;
}

export async function listFiscalPeriods(): Promise<FiscalPeriod[]> {
  if (isElectronAvailable()) return (await desktopAccounting().fiscalPeriods()) as FiscalPeriod[];
  const db = await getDb();
  const res = await db.query<FiscalPeriod>(
    `SELECT id, name, start_date::text, end_date::text, is_closed, closed_at::text FROM fiscal_periods ORDER BY start_date DESC`
  );
  return res.rows;
}

export async function getCurrentFiscalPeriod(): Promise<FiscalPeriod | null> {
  if (isElectronAvailable()) {
    const today = new Date().toISOString().slice(0, 10);
    const periods = await listFiscalPeriods();
    return periods.find((p) => !p.is_closed && p.start_date <= today && p.end_date >= today) ?? null;
  }
  const db = await getDb();
  const res = await db.query<FiscalPeriod>(
    `SELECT id, name, start_date::text, end_date::text, is_closed, closed_at::text
     FROM fiscal_periods WHERE start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE AND is_closed = false
     ORDER BY start_date DESC LIMIT 1`
  );
  return res.rows[0] ?? null;
}

export async function createFiscalPeriod(data: {
  name: string;
  startDate: string;
  endDate: string;
}): Promise<FiscalPeriod> {
  if (isElectronAvailable()) {
    const created = await desktopAccounting().createFiscalPeriod(data);
    const period = (await listFiscalPeriods()).find((p) => p.id === created.id);
    if (!period) throw new Error('تعذر قراءة الفترة المالية بعد إنشائها');
    return period;
  }
  const db = await getDb();
  const res = await db.query<FiscalPeriod>(
    `INSERT INTO fiscal_periods (name, start_date, end_date)
     VALUES ($1, $2, $3)
     RETURNING id, name, start_date::text, end_date::text, is_closed, closed_at::text`,
    [data.name, data.startDate, data.endDate]
  );
  return res.rows[0];
}

export async function closeFiscalPeriod(id: string, closedBy: string | null): Promise<void> {
  if (isElectronAvailable()) {
    await desktopAccounting().closeFiscalPeriod({ periodId: id });
    return;
  }
  const db = await getDb();
  await db.query(
    `UPDATE fiscal_periods SET is_closed = true, closed_at = now(), closed_by = $2 WHERE id = $1`,
    [id, closedBy]
  );
}
