import { getDb } from '@/db/db';
import { getDesktopApi, isElectronAvailable } from '@/lib/electronBridge';

export interface BackupLog {
  id: string;
  filename: string;
  file_size: number | null;
  status: string;
  is_manual: boolean;
  notes: string | null;
  created_at: string;
}

/**
 * في بيئة المتصفح: تصدير قاعدة البيانات كـ JSON (نسخة احتياطية حقيقية).
 * في بيئة Electron الإنتاجية: تُستبدل هذه الدوال بآلية SQLite Backup API.
 */

export async function listBackupLogs(): Promise<BackupLog[]> {
  if (isElectronAvailable()) {
    const files = await getDesktopApi().farm.backups.list();
    return files.map((file) => ({
      id: file.filename, filename: file.filename, file_size: file.size, status: 'success',
      is_manual: true, notes: null, created_at: file.createdAt,
    }));
  }
  const db = await getDb();
  const res = await db.query<BackupLog>(
    `SELECT id, filename, file_size, status, is_manual, notes, created_at::text FROM backup_logs ORDER BY created_at DESC`
  );
  return res.rows;
}

export async function createBackup(manual: boolean, createdBy: string | null): Promise<BackupLog> {
  if (isElectronAvailable()) {
    const { path: backupPath } = await getDesktopApi().backupCreate();
    const filename = backupPath.split(/[\\/]/).pop() ?? backupPath;
    return {
      id: filename, filename, file_size: null, status: 'success',
      is_manual: manual, notes: null, created_at: new Date().toISOString(),
    };
  }
  const db = await getDb();
  const filename = `farm-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const data = await exportDatabaseData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const fileSize = blob.size;

  // تنزيل الملف فعليًا
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);

  const res = await db.query<BackupLog>(
    `INSERT INTO backup_logs (filename, file_size, status, is_manual, created_by)
     VALUES ($1, $2, 'success', $3, $4)
     RETURNING id, filename, file_size, status, is_manual, notes, created_at::text`,
    [filename, fileSize, manual, createdBy]
  );
  return res.rows[0];
}

export async function restoreDesktopBackup(filename: string): Promise<{ success: boolean; message: string }> {
  try {
    await getDesktopApi().farm.backups.restore(filename);
    return { success: true, message: 'تمت الاستعادة. سيُعاد تشغيل البرنامج الآن.' };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : 'خطأ في الاستعادة' };
  }
}

export async function restoreBackup(file: File): Promise<{ success: boolean; message: string }> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data._meta || data._meta.type !== 'farm-backup') {
      return { success: false, message: 'الملف ليس نسخة احتياطية صالحة' };
    }
    await importDatabaseData(data);
    const db = await getDb();
    await db.query(
      `INSERT INTO backup_logs (filename, file_size, status, is_manual, notes) VALUES ($1, $2, 'restored', true, 'استعادة من ملف')`,
      [file.name, file.size]
    );
    return { success: true, message: 'تمت الاستعادة بنجاح. يُنصح بإعادة تشغيل البرنامج.' };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : 'خطأ في الاستعادة' };
  }
}

const BACKUP_TABLES = [
  'users', 'roles', 'permissions', 'user_permissions', 'audit_logs', 'app_settings',
  'activities', 'fiscal_periods', 'document_sequences', 'accounts', 'journal_entries',
  'journal_lines', 'opening_balances', 'parties', 'party_transactions', 'cashboxes',
  'cash_transactions', 'financial_transfers', 'checks', 'invoices', 'invoice_items',
  'payments', 'returns', 'products', 'stock_movements', 'stock_counts', 'stock_count_items',
  'expense_categories', 'expenses', 'expense_distributions', 'income_categories', 'incomes',
  'employees', 'attendance', 'salary_records', 'employee_advances', 'custom_fields',
  'backup_logs', 'import_batches',
];

async function exportDatabaseData(): Promise<Record<string, unknown>> {
  const db = await getDb();
  const data: Record<string, unknown> = { _meta: { type: 'farm-backup', version: 1, date: new Date().toISOString() } };
  for (const table of BACKUP_TABLES) {
    try {
      const res = await db.query<{ row: Record<string, unknown> }>(`SELECT row_to_json(t) as row FROM ${table} t`);
      data[table] = res.rows.map((r) => r.row);
    } catch { /* قد لا يوجد الجدول */ }
  }
  return data;
}

// استبدال كل الجداول الموجودة في الملف داخل معاملة واحدة؛ فشل أي جزء يلغي الاستعادة كلها
async function importDatabaseData(data: Record<string, unknown>): Promise<void> {
  const db = await getDb();
  const tables = BACKUP_TABLES.filter((table) => Array.isArray(data[table]));
  if (tables.length === 0) throw new Error('الملف لا يحتوي بيانات قابلة للاستعادة');
  await db.transaction(async (tx) => {
    await tx.exec('SET LOCAL session_replication_role = replica');
    for (const table of [...tables].reverse()) {
      await tx.query(`DELETE FROM ${table}`);
    }
    for (const table of tables) {
      await tx.query(
        `INSERT INTO ${table} SELECT * FROM json_populate_recordset(NULL::${table}, $1::json)`,
        [JSON.stringify(data[table])]
      );
    }
  });
}
