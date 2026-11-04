import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  Boxes,
  ClipboardCheck,
  PackagePlus,
  Plus,
  RefreshCw,
  Warehouse,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Badge from '@/components/ui/Badge';
import InventoryModal, { FormError, errorMessage } from '@/components/inventory/InventoryModal';
import { useSession } from '@/context/SessionContext';
import { formatEGP, formatNumber } from '@/lib/format';
import {
  CATEGORY_LABELS,
  MOVEMENT_LABELS,
  createProduct,
  createWarehouse,
  issueStock,
  listProducts,
  listStockBalances,
  listStockCounts,
  listStockMovements,
  listWarehouses,
  receiveStock,
  recordStockCount,
  transferStock,
  updateProduct,
  type StockCountForm,
  type StockEntryForm,
} from '@/services/inventoryService';
import { listActivities, type Activity } from '@/services/activityService';
import type {
  DesktopProductInput,
  DesktopProductRow,
  DesktopStockBalanceRow,
  DesktopStockCountRow,
  DesktopStockMovementRow,
  DesktopWarehouseRow,
} from '@/lib/electronBridge';

const today = () => new Date().toISOString().slice(0, 10);
const units = (milli: number) => milli / 1000;
const pounds = (piastres: number) => piastres / 100;

export default function InventoryPage() {
  const { hasPermission } = useSession();
  const [products, setProducts] = useState<DesktopProductRow[]>([]);
  const [warehouses, setWarehouses] = useState<DesktopWarehouseRow[]>([]);
  const [balances, setBalances] = useState<DesktopStockBalanceRow[]>([]);
  const [movements, setMovements] = useState<DesktopStockMovementRow[]>([]);
  const [counts, setCounts] = useState<DesktopStockCountRow[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [modal, setModal] = useState<'product' | 'warehouse' | 'entry' | 'transfer' | 'count' | null>(null);
  const [entryType, setEntryType] = useState<'in' | 'out'>('in');
  const [editingProduct, setEditingProduct] = useState<DesktopProductRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextProducts, nextWarehouses, nextMovements, nextCounts, nextActivities] = await Promise.all([
        listProducts(),
        listWarehouses(),
        listStockMovements(),
        listStockCounts(),
        listActivities(),
      ]);
      const warehouseId = selectedWarehouse && nextWarehouses.some((warehouse) => warehouse.id === selectedWarehouse)
        ? selectedWarehouse
        : nextWarehouses[0]?.id ?? '';
      const nextBalances = warehouseId ? await listStockBalances(warehouseId) : [];
      setProducts(nextProducts);
      setWarehouses(nextWarehouses);
      setBalances(nextBalances);
      setMovements(nextMovements);
      setCounts(nextCounts);
      setActivities(nextActivities.filter((activity) => activity.is_active));
      setSelectedWarehouse(warehouseId);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [selectedWarehouse]);

  useEffect(() => { void load(); }, [load]);

  const changeWarehouse = async (warehouseId: string) => {
    setSelectedWarehouse(warehouseId);
    try {
      setBalances(await listStockBalances(warehouseId));
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  };

  const totalValue = products.reduce((sum, product) => sum + pounds(product.total_value), 0);
  const lowStock = products.filter((product) => product.is_low_stock);
  const todayMovements = movements.filter((movement) => movement.date === today()).length;
  const selectedWarehouseName = warehouses.find((warehouse) => warehouse.id === selectedWarehouse)?.name ?? 'المخزن';

  const closeModal = () => {
    setModal(null);
    setEditingProduct(null);
  };

  const saved = async () => {
    closeModal();
    await load();
  };

  return (
    <div>
      <PageHeader
        title="المخازن"
        subtitle="إدارة الأصناف والأرصدة والحركات بمتوسط التكلفة المرجح"
        icon={Boxes}
        actions={hasPermission('inventory.add') ? (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setModal('warehouse')} className="btn-secondary"><Warehouse className="h-4 w-4" /> مخزن جديد</button>
            <button onClick={() => { setEntryType('in'); setModal('entry'); }} className="btn-secondary"><ArrowDownCircle className="h-4 w-4" /> وارد</button>
            <button onClick={() => { setEntryType('out'); setModal('entry'); }} className="btn-secondary"><ArrowUpCircle className="h-4 w-4" /> صادر</button>
            <button onClick={() => setModal('transfer')} className="btn-secondary"><ArrowLeftRight className="h-4 w-4" /> تحويل</button>
            {hasPermission('inventory.edit') && <button onClick={() => setModal('count')} className="btn-secondary"><ClipboardCheck className="h-4 w-4" /> جرد وتسوية</button>}
            <button onClick={() => setModal('product')} className="btn-primary"><Plus className="h-4 w-4" /> صنف جديد</button>
          </div>
        ) : undefined}
      />

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="grid grid-cols-2 gap-4 mb-4 lg:grid-cols-4">
        <StatBox label="قيمة المخزون" value={formatEGP(totalValue)} tone="text-blue-600" />
        <StatBox label="أصناف منخفضة" value={formatNumber(lowStock.length)} tone="text-amber-600" />
        <StatBox label="عدد الأصناف" value={formatNumber(products.length)} tone="text-slate-700" />
        <StatBox label="حركات اليوم" value={formatNumber(todayMovements)} tone="text-slate-700" />
      </div>

      <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-semibold text-slate-500">عرض أرصدة المخزن</p>
          <p className="mt-1 font-bold text-slate-800">{selectedWarehouseName}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={selectedWarehouse} onChange={(event) => void changeWarehouse(event.target.value)} className="input-base min-w-48">
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.is_default ? ' — افتراضي' : ''}</option>)}
          </select>
          <button onClick={() => void load()} className="btn-ghost" aria-label="تحديث"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="card overflow-hidden">
          <SectionTitle title="الأصناف" icon={Boxes} />
          {products.length === 0 ? <EmptyState icon={Boxes} title="لا توجد أصناف" description="أضف الأصناف التي تريد متابعتها في المخزون." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500">
                  <th className="px-4 py-3 text-right font-semibold">الصنف</th><th className="px-4 py-3 text-right font-semibold">الفئة</th>
                  <th className="px-4 py-3 text-right font-semibold">الرصيد الكلي</th><th className="px-4 py-3 text-right font-semibold">متوسط التكلفة</th>
                  <th className="px-4 py-3 text-right font-semibold">قيمة المخزون</th><th className="px-4 py-3 text-right font-semibold">الحالة</th>
                  {hasPermission('inventory.edit') && <th className="px-4 py-3 text-right font-semibold">إجراء</th>}
                </tr></thead>
                <tbody>{products.map((product) => (
                  <tr key={product.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3"><p className="font-semibold text-slate-800">{product.name}</p>{product.sku && <p className="text-xs text-slate-400">{product.sku}</p>}</td>
                    <td className="px-4 py-3"><Badge tone="slate">{CATEGORY_LABELS[product.category ?? 'other'] ?? 'أخرى'}</Badge></td>
                    <td className="px-4 py-3 num text-slate-600">{formatNumber(units(product.quantity_milli))} {product.unit}<p className="text-xs text-slate-400">حد الطلب: {formatNumber(units(product.reorder_level_milli))}</p></td>
                    <td className="px-4 py-3 num text-slate-600">{formatEGP(pounds(product.unit_cost))}</td>
                    <td className="px-4 py-3 num font-semibold text-slate-700">{formatEGP(pounds(product.total_value))}</td>
                    <td className="px-4 py-3">{product.is_low_stock ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> منخفض</span> : <Badge tone="emerald" dot>متوفر</Badge>}</td>
                    {hasPermission('inventory.edit') && <td className="px-4 py-3"><button onClick={() => { setEditingProduct(product); setModal('product'); }} className="btn-ghost text-xs">تعديل</button></td>}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card overflow-hidden">
          <SectionTitle title={`أرصدة ${selectedWarehouseName}`} icon={Warehouse} />
          {balances.length === 0 ? <EmptyState icon={Warehouse} title="المخزن فارغ" description="ستظهر الأرصدة هنا بعد تسجيل حركة وارد أو جرد." /> : (
            <div className="divide-y divide-slate-100">{balances.map((balance) => (
              <div key={balance.product_id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div><p className="font-semibold text-slate-800">{balance.product_name}</p><p className="text-xs text-slate-400">قيمة الرصيد: {formatEGP(pounds(balance.total_value))}</p></div>
                <p className="num font-bold text-slate-700">{formatNumber(units(balance.quantity_milli))} {balance.unit}</p>
              </div>
            ))}</div>
          )}
        </section>

        <section className="card overflow-hidden xl:col-span-2">
          <SectionTitle title="آخر حركات المخزون" icon={ArrowLeftRight} />
          {movements.length === 0 ? <EmptyState icon={PackagePlus} title="لا توجد حركات" description="تظهر هنا حركات الوارد والصادر والتحويل والجرد." /> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500">
              <th className="px-4 py-3 text-right font-semibold">التاريخ</th><th className="px-4 py-3 text-right font-semibold">الصنف</th><th className="px-4 py-3 text-right font-semibold">المخزن</th><th className="px-4 py-3 text-right font-semibold">النوع</th><th className="px-4 py-3 text-right font-semibold">الكمية</th><th className="px-4 py-3 text-right font-semibold">القيمة</th>
            </tr></thead><tbody>{movements.slice(0, 30).map((movement) => (
              <tr key={movement.id} className="border-b border-slate-50 last:border-0"><td className="px-4 py-3 num text-slate-500">{movement.date}</td><td className="px-4 py-3 font-semibold text-slate-700">{movement.product_name}</td><td className="px-4 py-3 text-slate-500">{movement.warehouse_name}</td><td className="px-4 py-3"><Badge tone={movement.direction === 'in' ? 'emerald' : 'rose'}>{MOVEMENT_LABELS[movement.type] ?? movement.type}</Badge></td><td className="px-4 py-3 num text-slate-600">{movement.direction === 'in' ? '+' : '−'}{formatNumber(units(movement.quantity_milli))} {movement.unit}</td><td className="px-4 py-3 num text-slate-600">{formatEGP(pounds(movement.total_cost))}</td></tr>
            ))}</tbody></table></div>
          )}
        </section>

        <section className="card overflow-hidden xl:col-span-2">
          <SectionTitle title="سجل الجرد والتسويات" icon={ClipboardCheck} />
          {counts.length === 0 ? <EmptyState icon={ClipboardCheck} title="لا يوجد جرد مسجل" description="سجل جردًا لمقارنة الرصيد الفعلي بالرصيد الدفتري." /> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500"><th className="px-4 py-3 text-right font-semibold">المستند</th><th className="px-4 py-3 text-right font-semibold">التاريخ</th><th className="px-4 py-3 text-right font-semibold">المخزن</th><th className="px-4 py-3 text-right font-semibold">الحالة</th></tr></thead><tbody>{counts.map((count) => <tr key={count.id} className="border-b border-slate-50 last:border-0"><td className="px-4 py-3 font-semibold text-slate-700">{count.doc_number}</td><td className="px-4 py-3 num text-slate-500">{count.date}</td><td className="px-4 py-3 text-slate-500">{count.warehouse_name}</td><td className="px-4 py-3"><Badge tone={count.status === 'adjusted' ? 'amber' : 'emerald'}>{count.status === 'adjusted' ? 'تمت التسوية' : 'مطابق'}</Badge></td></tr>)}</tbody></table></div>
          )}
        </section>
      </div>

      {modal === 'product' && <ProductModal product={editingProduct} onClose={closeModal} onSaved={saved} />}
      {modal === 'warehouse' && <WarehouseModal onClose={closeModal} onSaved={saved} />}
      {modal === 'entry' && <StockEntryModal type={entryType} products={products} warehouses={warehouses} activities={activities} onClose={closeModal} onSaved={saved} />}
      {modal === 'transfer' && <TransferModal products={products} warehouses={warehouses} onClose={closeModal} onSaved={saved} />}
      {modal === 'count' && <StockCountModal products={products} warehouses={warehouses} onClose={closeModal} onSaved={saved} />}
    </div>
  );
}

function SectionTitle({ title, icon: Icon }: { title: string; icon: typeof Boxes }) {
  return <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3"><Icon className="h-4 w-4 text-brand-600" /><h3 className="font-semibold text-slate-800">{title}</h3></div>;
}

function StatBox({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className="card p-4"><p className="text-sm text-slate-500">{label}</p><p className={`mt-2 text-2xl font-bold num ${tone}`}>{value}</p></div>;
}

function ModalActions({ onSave, onClose, saving }: { onSave: () => void; onClose: () => void; saving: boolean }) {
  return <div className="mt-5 flex gap-2"><button onClick={onSave} disabled={saving} className="btn-primary flex-1">{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button><button onClick={onClose} disabled={saving} className="btn-secondary">إلغاء</button></div>;
}

function ProductModal({ product, onClose, onSaved }: { product: DesktopProductRow | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(product?.name ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [category, setCategory] = useState(product?.category ?? 'supplies');
  const [unit, setUnit] = useState(product?.unit ?? 'قطعة');
  const [reorderLevel, setReorderLevel] = useState(String(product ? units(product.reorder_level_milli) : 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!name.trim() || !unit.trim()) { setError('اسم الصنف والوحدة مطلوبان'); return; }
    const input: DesktopProductInput = { name: name.trim(), sku: sku.trim() || null, category, unit: unit.trim(), reorderLevel: Number(reorderLevel) || 0 };
    setSaving(true);
    try { if (product) await updateProduct(product.id, input); else await createProduct(input); await onSaved(); } catch (saveError) { setError(errorMessage(saveError)); } finally { setSaving(false); }
  };

  return <InventoryModal title={product ? 'تعديل الصنف' : 'صنف جديد'} onClose={onClose}><div className="space-y-3">
    <Field label="اسم الصنف"><input value={name} onChange={(event) => setName(event.target.value)} className="input-base" /></Field>
    <Field label="رمز الصنف (اختياري)"><input value={sku} onChange={(event) => setSku(event.target.value)} className="input-base" /></Field>
    <Field label="الفئة"><select value={category ?? 'other'} onChange={(event) => setCategory(event.target.value)} className="input-base"><option value="feed">أعلاف</option><option value="supplies">مستلزمات</option><option value="medication">أدوية</option><option value="spare_parts">قطع غيار</option><option value="other">أخرى</option></select></Field>
    <div className="grid grid-cols-2 gap-3"><Field label="الوحدة"><input value={unit} onChange={(event) => setUnit(event.target.value)} className="input-base" /></Field><Field label="حد إعادة الطلب"><input type="number" min="0" step="0.001" value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)} className="input-base num" /></Field></div>
    <FormError message={error} />
  </div><ModalActions onSave={() => void save()} onClose={onClose} saving={saving} /></InventoryModal>;
}

function WarehouseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const save = async () => { setError(null); if (!name.trim()) { setError('اسم المخزن مطلوب'); return; } setSaving(true); try { await createWarehouse(name.trim()); await onSaved(); } catch (saveError) { setError(errorMessage(saveError)); } finally { setSaving(false); } };
  return <InventoryModal title="مخزن جديد" onClose={onClose}><Field label="اسم المخزن"><input value={name} onChange={(event) => setName(event.target.value)} className="input-base" autoFocus /></Field><div className="mt-3"><FormError message={error} /></div><ModalActions onSave={() => void save()} onClose={onClose} saving={saving} /></InventoryModal>;
}

function StockEntryModal({ type, products, warehouses, activities, onClose, onSaved }: { type: 'in' | 'out'; products: DesktopProductRow[]; warehouses: DesktopWarehouseRow[]; activities: Activity[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [productId, setProductId] = useState(''); const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? ''); const [date, setDate] = useState(today()); const [quantity, setQuantity] = useState(''); const [unitCost, setUnitCost] = useState(''); const [activityId, setActivityId] = useState(''); const [notes, setNotes] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const save = async () => { setError(null); const qty = Number(quantity); if (!productId || !warehouseId || !date || !Number.isFinite(qty) || qty <= 0) { setError('اختر الصنف والمخزن وأدخل كمية صحيحة'); return; } if (type === 'in' && (!Number.isFinite(Number(unitCost)) || Number(unitCost) < 0)) { setError('أدخل تكلفة الوحدة بشكل صحيح'); return; } const form: StockEntryForm = { date, productId, warehouseId, quantity: qty, ...(type === 'in' ? { unitCostPounds: Number(unitCost) } : {}), activityId: activityId || null, notes: notes.trim() || null }; setSaving(true); try { if (type === 'in') await receiveStock(form); else await issueStock(form); await onSaved(); } catch (saveError) { setError(errorMessage(saveError)); } finally { setSaving(false); } };
  return <InventoryModal title={type === 'in' ? 'تسجيل وارد يدوي' : 'تسجيل صادر يدوي'} onClose={onClose}><div className="space-y-3"><Field label="الصنف"><select value={productId} onChange={(event) => setProductId(event.target.value)} className="input-base"><option value="">اختر الصنف</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} — {formatNumber(units(product.quantity_milli))} {product.unit}</option>)}</select></Field><Field label="المخزن"><select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="input-base">{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field><Field label="التاريخ"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input-base" /></Field><div className="grid grid-cols-2 gap-3"><Field label="الكمية"><input type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="input-base num" /></Field>{type === 'in' && <Field label="تكلفة الوحدة بالجنيه"><input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} className="input-base num" /></Field>}</div><Field label="النشاط (اختياري)"><select value={activityId} onChange={(event) => setActivityId(event.target.value)} className="input-base"><option value="">عام</option>{activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select></Field><Field label="ملاحظات (اختياري)"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="input-base min-h-20" /></Field><FormError message={error} /></div><ModalActions onSave={() => void save()} onClose={onClose} saving={saving} /></InventoryModal>;
}

function TransferModal({ products, warehouses, onClose, onSaved }: { products: DesktopProductRow[]; warehouses: DesktopWarehouseRow[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [productId, setProductId] = useState(''); const [fromWarehouseId, setFromWarehouseId] = useState(warehouses[0]?.id ?? ''); const [toWarehouseId, setToWarehouseId] = useState(warehouses[1]?.id ?? ''); const [date, setDate] = useState(today()); const [quantity, setQuantity] = useState(''); const [notes, setNotes] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const save = async () => { setError(null); const qty = Number(quantity); if (!productId || !fromWarehouseId || !toWarehouseId || fromWarehouseId === toWarehouseId || !Number.isFinite(qty) || qty <= 0) { setError('اختر مخزنين مختلفين وأدخل كمية صحيحة'); return; } setSaving(true); try { await transferStock({ date, productId, fromWarehouseId, toWarehouseId, quantity: qty, notes: notes.trim() || null }); await onSaved(); } catch (saveError) { setError(errorMessage(saveError)); } finally { setSaving(false); } };
  return <InventoryModal title="تحويل بين المخازن" onClose={onClose}><div className="space-y-3"><Field label="الصنف"><select value={productId} onChange={(event) => setProductId(event.target.value)} className="input-base"><option value="">اختر الصنف</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field><div className="grid grid-cols-2 gap-3"><Field label="من مخزن"><select value={fromWarehouseId} onChange={(event) => setFromWarehouseId(event.target.value)} className="input-base">{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field><Field label="إلى مخزن"><select value={toWarehouseId} onChange={(event) => setToWarehouseId(event.target.value)} className="input-base">{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field></div><div className="grid grid-cols-2 gap-3"><Field label="التاريخ"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input-base" /></Field><Field label="الكمية"><input type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="input-base num" /></Field></div><Field label="ملاحظات (اختياري)"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="input-base min-h-20" /></Field><FormError message={error} /></div><ModalActions onSave={() => void save()} onClose={onClose} saving={saving} /></InventoryModal>;
}

function StockCountModal({ products, warehouses, onClose, onSaved }: { products: DesktopProductRow[]; warehouses: DesktopWarehouseRow[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? ''); const [date, setDate] = useState(today()); const [notes, setNotes] = useState(''); const [values, setValues] = useState<Record<string, string>>({}); const [costs, setCosts] = useState<Record<string, string>>({}); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [balances, setBalances] = useState<DesktopStockBalanceRow[]>([]);
  useEffect(() => { if (warehouseId) void listStockBalances(warehouseId).then(setBalances).catch((loadError) => setError(errorMessage(loadError))); }, [warehouseId]);
  const balanceFor = (productId: string) => balances.find((balance) => balance.product_id === productId);
  const save = async () => { setError(null); const items: StockCountForm['items'] = products.filter((product) => values[product.id] !== undefined && values[product.id] !== '').map((product) => ({ productId: product.id, countedQuantity: Number(values[product.id]), ...(costs[product.id] !== undefined && costs[product.id] !== '' ? { unitCostPounds: Number(costs[product.id]) } : {}) })); if (!warehouseId || items.length === 0 || items.some((item) => !Number.isFinite(item.countedQuantity) || item.countedQuantity < 0)) { setError('أدخل الرصيد الفعلي لصنف واحد على الأقل'); return; } setSaving(true); try { const result = await recordStockCount({ date, warehouseId, notes: notes.trim() || null, items }); setError(`تم حفظ الجرد ${result.docNumber}. فروق الزيادة: ${formatEGP(pounds(result.gains))}، وفروق العجز: ${formatEGP(pounds(result.losses))}`); await onSaved(); } catch (saveError) { setError(errorMessage(saveError)); } finally { setSaving(false); } };
  return <InventoryModal title="جرد وتسوية المخزون" onClose={onClose} wide><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><Field label="المخزن"><select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="input-base">{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field><Field label="التاريخ"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input-base" /></Field></div><div className="overflow-x-auto rounded-xl border border-slate-100"><table className="w-full text-sm"><thead><tr className="bg-slate-50 text-slate-500"><th className="px-3 py-2 text-right">الصنف</th><th className="px-3 py-2 text-right">دفترى</th><th className="px-3 py-2 text-right">فعلي</th><th className="px-3 py-2 text-right">تكلفة الوحدة عند الزيادة</th></tr></thead><tbody>{products.map((product) => { const balance = balanceFor(product.id); const empty = !balance || balance.quantity_milli === 0; return <tr key={product.id} className="border-t border-slate-100"><td className="px-3 py-2 font-semibold">{product.name}</td><td className="px-3 py-2 num text-slate-500">{formatNumber(units(balance?.quantity_milli ?? 0))}</td><td className="px-3 py-2"><input type="number" min="0" step="0.001" placeholder="اتركه بدون جرد" value={values[product.id] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [product.id]: event.target.value }))} className="input-base min-w-28 num" /></td><td className="px-3 py-2">{empty && <input type="number" min="0" step="0.01" placeholder="مطلوب للزيادة" value={costs[product.id] ?? ''} onChange={(event) => setCosts((current) => ({ ...current, [product.id]: event.target.value }))} className="input-base min-w-32 num" />}</td></tr>; })}</tbody></table></div><Field label="ملاحظات (اختياري)"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="input-base min-h-20" /></Field><FormError message={error} /></div><ModalActions onSave={() => void save()} onClose={onClose} saving={saving} /></InventoryModal>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>{children}</label>; }
