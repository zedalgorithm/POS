import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { addProduct, listProducts, DbProduct, createInitialBatchForNewProduct, addStockBatch, listBatchesByProduct, updateBatchSellingPrice, deleteProductBatch, deleteEmptyBatches } from '@/lib/db';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getQueuedCount, listQueuedSales, deleteQueuedSale, setSaleStatus, getProductsCache, saveProductsCache } from '@/lib/offlineDB';
import { syncQueuedSales } from '@/lib/sync';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useNavigate } from 'react-router-dom';

interface SaleRow { total: number; timestamp: string; }

const Admin = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  // Removed Add Product form in favor of Revenue dashboard
  const [form, setForm] = useState({ name: '', price: '', boughtPrice: '', category: '', stock: '', barcode: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [info, setInfo] = useState<string>('');
  const [products, setProducts] = useState<DbProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [salesError, setSalesError] = useState<string>('');
  const [saleItems, setSaleItems] = useState<any[]>([]);
  const [saleItemsError, setSaleItemsError] = useState<string>('');
  const [period, setPeriod] = useState<'today' | '7d' | '30d'>('today');
  const [productsError, setProductsError] = useState<string>('');
  // Per-product Add Stock form state
  const [addStockState, setAddStockState] = useState<Record<string, { qty: string; bp: string; newPrice?: string }>>({});
  const [addingStockFor, setAddingStockFor] = useState<string | null>(null);
  // Batches dialog state
  const [batchesOpen, setBatchesOpen] = useState(false);
  const [batchesProduct, setBatchesProduct] = useState<DbProduct | null>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchEdits, setBatchEdits] = useState<Record<string, string>>({});
  const [backfillQty, setBackfillQty] = useState<string>('');
  const [backfillBP, setBackfillBP] = useState<string>('');
  const [backfillSP, setBackfillSP] = useState<string>('');
  // Offline sync controls
  const [pendingSync, setPendingSync] = useState<number>(0);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueRows, setQueueRows] = useState<any[]>([]);

  useEffect(() => {
    const loadData = async () => {
      // Products with offline cache fallback
      try {
        if (navigator.onLine) {
          const { data, error } = await listProducts();
          if (!error && data) {
            setProducts(data);
            try { await saveProductsCache(data as any[]); } catch {}
          } else {
            const cached = await getProductsCache();
            if (cached) setProducts(cached as any);
            if (error) setProductsError(error.message);
          }
        } else {
          const cached = await getProductsCache();
          if (cached) setProducts(cached as any);
        }
      } catch (e: any) {
        const cached = await getProductsCache();
        if (cached) setProducts(cached as any);
        setProductsError(e?.message || 'Failed to load products');
      }
      const { data: salesData, error: sErr } = await supabase
        .from('sales')
        .select('total,timestamp,cogs,items_count,payment_method')
        .order('timestamp', { ascending: false })
        .limit(100);
      if (sErr) setSalesError(sErr.message);
      else setSales((salesData as SaleRow[]) || []);

      // Load recent sale_items (last 30 days)
      const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: siData, error: siErr } = await supabase
        .from('sale_items')
        .select('product_id,product_name,category,unit_price,quantity,line_total,line_cogs,created_at')
        .gte('created_at', since30d)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (siErr) setSaleItemsError(siErr.message);
      else setSaleItems(siData || []);
      // Pending sync count
      try { setPendingSync(await getQueuedCount()); } catch {}
    };
    loadData();
    // Periodic refresh of pending sync count
    const t = setInterval(async () => { try { setPendingSync(await getQueuedCount()); } catch {} }, 10000);
    return () => clearInterval(t);
  }, []);

  const totals = useMemo(() => {
    const count = sales.length;
    const total = sales.reduce((sum, s) => sum + (s.total || 0), 0);
    const today = new Date().toDateString();
    const todaySales = sales.filter(s => new Date(s.timestamp).toDateString() === today);
    const todayTotal = todaySales.reduce((sum, s) => sum + (s.total || 0), 0);
    const now = new Date();
    const last7dSales = sales.filter(s => new Date(s.timestamp).getTime() >= now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last7d = last7dSales.reduce((sum, s) => sum + (s.total || 0), 0);
    const last30dSales = sales.filter(s => new Date(s.timestamp).getTime() >= now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last30d = last30dSales.reduce((sum, s) => sum + (s.total || 0), 0);
    return { count, total, todayTotal, last7d, last30d, todaySales, last7dSales, last30dSales } as any;
  }, [sales]);

  // Period filters
  const periodSales = useMemo(() => {
    if (period === 'today') return totals.todaySales as any[];
    if (period === '7d') return totals.last7dSales as any[];
    return totals.last30dSales as any[];
  }, [period, totals]);

  const periodItems = useMemo(() => {
    const cutoff = period === 'today' ? new Date(new Date().toDateString()).getTime() : Date.now() - (period === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000;
    return saleItems.filter(si => new Date(si.created_at).getTime() >= cutoff);
  }, [saleItems, period]);

  // KPI: Revenue, Transactions, Avg Basket, Items Sold
  const kpis = useMemo(() => {
    const revenue = periodSales.reduce((s, r) => s + (r.total || 0), 0);
    const transactions = periodSales.length;
    const avgBasket = transactions > 0 ? revenue / transactions : 0;
    const itemsSold = periodSales.reduce((s, r) => s + (r.items_count || 0), 0) || periodItems.reduce((s, it) => s + (it.quantity || 0), 0);
    return { revenue, transactions, avgBasket, itemsSold };
  }, [periodSales, periodItems]);

  // Profit snapshot from sales (sum of cogs)
  const profit = useMemo(() => {
    const revenue = kpis.revenue;
    const cogs = periodSales.reduce((s, r) => s + (r.cogs || 0), 0);
    const gross = revenue - cogs;
    const margin = revenue > 0 ? (gross / revenue) * 100 : 0;
    return { revenue, cogs, gross, margin };
  }, [kpis.revenue, periodSales]);

  // Top movers by quantity (period)
  const topMovers = useMemo(() => {
    const byProd: Record<string, { name: string; qty: number; sales: number }> = {};
    for (const it of periodItems) {
      const key = it.product_id;
      if (!byProd[key]) byProd[key] = { name: it.product_name, qty: 0, sales: 0 };
      byProd[key].qty += Number(it.quantity || 0);
      byProd[key].sales += Number(it.line_total || 0);
    }
    return Object.entries(byProd)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [periodItems]);

  // Sales by category (period)
  const salesByCategory = useMemo(() => {
    const byCat: Record<string, { total: number; qty: number }> = {};
    for (const it of periodItems) {
      const cat = it.category || 'Uncategorized';
      if (!byCat[cat]) byCat[cat] = { total: 0, qty: 0 };
      byCat[cat].total += Number(it.line_total || 0);
      byCat[cat].qty += Number(it.quantity || 0);
    }
    return Object.entries(byCat).map(([category, v]) => ({ category, ...v })).sort((a, b) => b.total - a.total);
  }, [periodItems]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q)
    );
  }, [products, searchQuery]);

  // ----- Batch helpers (outside useEffect) -----
  const loadBatches = async (productId: string) => {
    setBatchesLoading(true);
    const { data, error } = await listBatchesByProduct(productId);
    if (!error) setBatches(data);
    setBatchesLoading(false);
  };

  const openBatches = async (product: DbProduct) => {
    setBatchesOpen(true);
    setBatchesProduct(product);
    setBatchEdits({});
    setBackfillQty(product.stock ? String(product.stock) : '');
    setBackfillBP('');
    setBackfillSP(product.price ? String(Number(product.price).toFixed(2)) : '');
    await loadBatches(product.id);
  };

  // ----- Offline Queue helpers -----
  async function refreshQueue() {
    setQueueLoading(true);
    try {
      const rows = await listQueuedSales();
      setQueueRows(rows as any);
      setPendingSync((rows as any[]).filter(r => r.sale?.status === 'queued').length);
    } catch (_) {}
    setQueueLoading(false);
  }

  async function onOpenQueue() {
    setQueueOpen(true);
    await refreshQueue();
  }

  async function onSyncNow() {
    await syncQueuedSales();
    await refreshQueue();
  }

  async function onDeleteQueued(id: string) {
    await deleteQueuedSale(id);
    await refreshQueue();
  }

  async function onSyncOne(id: string) {
    await syncQueuedSales(id);
    await refreshQueue();
  }

  async function onResetQueued(id: string) {
    await setSaleStatus(id, 'queued', null as any);
    await refreshQueue();
  }

  const setBatchEdit = (batchId: string, value: string) => {
    setBatchEdits(prev => ({ ...prev, [batchId]: value }));
  };

  const saveBatchPrice = async (batchId: string) => {
    const value = parseFloat(batchEdits[batchId] ?? '');
    if (isNaN(value) || value <= 0) {
      setError('Selling price must be greater than 0');
      return;
    }
    const { error } = await updateBatchSellingPrice(batchId, value);
    if (error) setError(error.message || 'Failed to update batch price');
    else {
      setInfo('Batch price updated');
      if (batchesProduct) await loadBatches(batchesProduct.id);
    }
  };

  const setAddStockField = (productId: string, field: 'qty' | 'bp' | 'newPrice', value: string) => {
    setAddStockState(prev => ({
      ...prev,
      [productId]: { qty: prev[productId]?.qty ?? '', bp: prev[productId]?.bp ?? '', newPrice: prev[productId]?.newPrice ?? '', [field]: value },
    }));
  };

  const onAddStock = async (product: DbProduct) => {
    setError('');
    setInfo('');
    const state = addStockState[product.id] || { qty: '', bp: '', newPrice: '' };
    const qty = parseInt(state.qty, 10);
    const bp = parseFloat(state.bp);
    const np = state.newPrice ? parseFloat(state.newPrice) : undefined;
    if (!state.qty || isNaN(qty) || qty <= 0) {
      setError('Add Stock: quantity must be a positive number');
      return;
    }
    if (!state.bp || isNaN(bp) || bp <= 0) {
      setError('Add Stock: bought price must be a positive number');
      return;
    }
    if (state.newPrice && (isNaN(np as number) || (np as number) <= 0)) {
      setError('Add Stock: new selling price must be greater than 0 if provided');
      return;
    }
    setAddingStockFor(product.id);
    const sellingPriceToUse = (np && !isNaN(np)) ? np : Number(product.price);
    const { error } = await addStockBatch(product.id, bp, qty, sellingPriceToUse);
    if (error) {
      setError(error.message || 'Failed to add stock');
    } else {
      // Update UI stock locally
      setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, stock: (p.stock || 0) + qty } : p)));
      // Best-effort cleanup of empty batches
      try { await deleteEmptyBatches(product.id); } catch (_) {}
      // Clear local input state for this product
      setAddStockState(prev => ({ ...prev, [product.id]: { qty: '', bp: '', newPrice: '' } }));
      setInfo('Stock added.');
    }
    setAddingStockFor(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!form.name.trim() || !form.price || !form.category || form.stock === '') {
      setError('Please fill in name, price, category, and stock.');
      return;
    }
    const price = parseFloat(form.price);
    const boughtPriceNum = form.boughtPrice ? parseFloat(form.boughtPrice) : undefined;
    const stock = parseInt(form.stock, 10);
    if (isNaN(price) || price <= 0) {
      setError('Price must be a positive number');
      return;
    }
    if (form.boughtPrice && (isNaN(boughtPriceNum as number) || (boughtPriceNum as number) <= 0)) {
      setError('Bought price must be greater than 0 if provided');
      return;
    }
    if (isNaN(stock) || stock < 0) {
      setError('Stock must be 0 or more');
      return;
    }
    setSaving(true);
    const { data, error } = await addProduct({
      name: form.name.trim(),
      price,
      bought_price: boughtPriceNum ?? null,
      category: form.category,
      stock,
      barcode: form.barcode.trim() || null,
      image: null,
    });
    if (error) {
      setError(error.message || 'Failed to add product. Ensure the products table exists.');
    } else if (data) {
      // Create initial batch if applicable (FIFO)
      try {
        const qty = parseInt(form.stock, 10);
        const bp = form.boughtPrice ? parseFloat(form.boughtPrice) : undefined;
        if (qty > 0 && bp && !isNaN(bp)) {
          const { error: batchErr } = await createInitialBatchForNewProduct(data.id, bp, qty);
          if (batchErr) {
            console.warn('Failed to create initial batch:', batchErr);
          }
        }
      } catch (e) {
        console.warn('Error while creating initial batch', e);
      }

      setInfo('Product added.');
      setProducts(prev => [data, ...prev]);
      setForm({ name: '', price: '', boughtPrice: '', category: '', stock: '', barcode: '' });
    }
    setSaving(false);
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardHeader><CardTitle>Authentication required</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-4">Please sign in to access the admin page.</p>
            <Button onClick={() => navigate('/')}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardHeader><CardTitle>Admins only</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-4">You need admin permissions to view this page.</p>
            <Button onClick={() => navigate('/')}>Back to POS</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <div className="rounded-xl border bg-gradient-to-r from-secondary to-accent/60 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <div className="flex items-center gap-2">
          <Badge variant={pendingSync > 0 ? 'destructive' : 'secondary'}>Pending sync: {pendingSync}</Badge>
          <Button variant="outline" onClick={onSyncNow}>Sync now</Button>
          <Button variant="outline" onClick={onOpenQueue}>Offline Queue</Button>
          <Button variant="outline" onClick={() => navigate('/')}>Back to POS</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Profit Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-3">
              {(['today','7d','30d'] as const).map(p => (
                <Button key={p} size="sm" variant={period===p? 'default':'outline'} onClick={() => setPeriod(p)}>
                  {p==='today'?'Today':p==='7d'?'Last 7d':'Last 30d'}
                </Button>
              ))}
            </div>
            {salesError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>
                  {salesError}
                </AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-md border"><div className="text-xs text-muted-foreground">Revenue</div><div className="text-xl font-semibold">₱ {profit.revenue.toFixed(2)}</div></div>
              <div className="p-4 rounded-md border"><div className="text-xs text-muted-foreground">COGS</div><div className="text-xl font-semibold">₱ {profit.cogs.toFixed(2)}</div></div>
              <div className="p-4 rounded-md border"><div className="text-xs text-muted-foreground">Gross Profit</div><div className="text-xl font-semibold">₱ {profit.gross.toFixed(2)}</div></div>
              <div className="p-4 rounded-md border"><div className="text-xs text-muted-foreground">Margin</div><div className="text-xl font-semibold">{profit.margin.toFixed(1)}%</div></div>
            </div>
            <div className="mt-4 max-h-64 overflow-auto">
              {sales.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales found.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b"><th className="py-2">When</th><th>Total</th><th>Items</th><th>Pay</th></tr>
                  </thead>
                  <tbody>
                    {sales.map((s, i) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="py-2">{new Date(s.timestamp).toLocaleString()}</td>
                        <td>₱ {Number(s.total).toFixed(2)}</td>
                        <td>{Number((s as any).items_count || 0)}</td>
                        <td>{(s as any).payment_method || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Movers</CardTitle>
          </CardHeader>
          <CardContent>
            {saleItemsError && (
              <Alert variant="destructive" className="mb-2"><AlertDescription>{saleItemsError}</AlertDescription></Alert>
            )}
            {topMovers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sale items for selected period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b"><th className="py-2">Product</th><th>Qty</th><th>Sales</th></tr>
                </thead>
                <tbody>
                  {topMovers.map(m => (
                    <tr key={m.id} className="border-b last:border-b-0"><td className="py-2">{m.name}</td><td>{m.qty}</td><td>₱ {m.sales.toFixed(2)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sales by Category</CardTitle></CardHeader>
          <CardContent>
            {salesByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sale items for selected period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b"><th className="py-2">Category</th><th>Sales</th><th>Qty</th></tr>
                </thead>
                <tbody>
                  {salesByCategory.map((c, i) => (
                    <tr key={i} className="border-b last:border-b-0"><td className="py-2">{c.category}</td><td>₱ {c.total.toFixed(2)}</td><td>{c.qty}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      

      <Card>
        <CardHeader>
          <CardTitle>Latest Products</CardTitle>
        </CardHeader>
        <CardContent>
          {productsError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                {productsError}. If the products table doesn't exist or RLS blocks access, create it and add basic policies:
                <pre className="mt-2 whitespace-pre-wrap text-xs">{`create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  price numeric not null,
  stock integer not null default 0,
  barcode text,
  image text,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security and allow authenticated users to read
alter table public.products enable row level security;
create policy "products read" on public.products for select using (true);
create policy "products insert" on public.products for insert with check (auth.role() = 'authenticated');
create policy "products update" on public.products for update using (auth.role() = 'authenticated');`}</pre>
              </AlertDescription>
            </Alert>
          )}
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products yet.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-muted-foreground">Latest Products</div>
                <div className="w-64">
                  <Input
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="overflow-auto">
                <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2">Name</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Barcode</th>
                    <th>Created</th>
                    <th className="w-[480px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(p => (
                    <tr key={p.id} className="border-b last:border-b-0 align-top">
                      <td className="py-2">{p.name}</td>
                      <td>{p.category}</td>
                      <td>₱ {Number(p.price).toFixed(2)}</td>
                      <td>{p.stock}</td>
                      <td>{p.barcode || '-'}</td>
                      <td>{new Date(p.created_at).toLocaleString()}</td>
                      <td>
                        <div className="flex gap-2 items-end flex-wrap">
                          <div className="space-y-1">
                            <Label htmlFor={`qty-${p.id}`}>Qty</Label>
                            <Input
                              id={`qty-${p.id}`}
                              type="number"
                              min={1}
                              value={addStockState[p.id]?.qty ?? ''}
                              onChange={e => setAddStockField(p.id, 'qty', e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`bp-${p.id}`}>Bought ₱</Label>
                            <Input
                              id={`bp-${p.id}`}
                              type="number"
                              step="0.01"
                              min={0}
                              value={addStockState[p.id]?.bp ?? ''}
                              onChange={e => setAddStockField(p.id, 'bp', e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`np-${p.id}`}>Batch Price ₱</Label>
                            <Input
                              id={`np-${p.id}`}
                              type="number"
                              step="0.01"
                              min={0}
                              placeholder={Number(p.price).toFixed(2)}
                              value={addStockState[p.id]?.newPrice ?? ''}
                              onChange={e => setAddStockField(p.id, 'newPrice', e.target.value)}
                            />
                          </div>
                          <Button
                            onClick={() => onAddStock(p)}
                            disabled={addingStockFor === p.id}
                          >
                            {addingStockFor === p.id ? 'Adding...' : 'Add Stock'}
                          </Button>
                          <Button variant="outline" onClick={() => openBatches(p)}>View Batches</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={batchesOpen} onOpenChange={setBatchesOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {batchesProduct ? `Batches — ${batchesProduct.name}` : 'Batches'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">FIFO order: oldest first</div>
              {batchesProduct && (
                <Button size="sm" variant="outline" onClick={() => loadBatches(batchesProduct.id)} disabled={batchesLoading}>
                  {batchesLoading ? 'Refreshing...' : 'Refresh'}
                </Button>
              )}
            </div>
            <div className="border rounded-md overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 px-2">Created</th>
                    <th className="px-2">Remaining</th>
                    <th className="px-2">Bought ₱</th>
                    <th className="px-2">Selling ₱</th>
                    <th className="px-2">Update</th>
                    <th className="px-2">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.length === 0 ? (
                    <>
                      <tr><td className="py-4 px-2 text-muted-foreground" colSpan={5}>No batches</td></tr>
                      {batchesProduct && (batchesProduct.stock ?? 0) > 0 && (
                        <tr>
                          <td colSpan={5} className="p-3">
                            <div className="space-y-2">
                              <div className="text-sm font-medium">Backfill initial batch from existing stock</div>
                              <div className="grid grid-cols-3 gap-2 items-end">
                                <div>
                                  <Label htmlFor="bf-qty">Qty</Label>
                                  <Input id="bf-qty" type="number" min={1} value={backfillQty} onChange={e => setBackfillQty(e.target.value)} />
                                </div>
                                <div>
                                  <Label htmlFor="bf-bp">Bought ₱</Label>
                                  <Input id="bf-bp" type="number" step="0.01" min={0} value={backfillBP} onChange={e => setBackfillBP(e.target.value)} />
                                </div>
                                <div>
                                  <Label htmlFor="bf-sp">Selling ₱</Label>
                                  <Input id="bf-sp" type="number" step="0.01" min={0} value={backfillSP} onChange={e => setBackfillSP(e.target.value)} />
                                </div>
                              </div>
                              <Button
                                size="sm"
                                onClick={async () => {
                                  const qty = parseInt(backfillQty || '0', 10);
                                  const bp = parseFloat(backfillBP || '0');
                                  const sp = parseFloat(backfillSP || '0');
                                  if (!qty || qty <= 0) { setError('Backfill: qty must be > 0'); return; }
                                  if (!bp || bp <= 0) { setError('Backfill: bought price must be > 0'); return; }
                                  if (!sp || sp <= 0) { setError('Backfill: selling price must be > 0'); return; }
                                  if (!batchesProduct) return;
                                  const { error } = await createInitialBatchForNewProduct(batchesProduct.id, bp, qty, sp);
                                  if (error) setError(error.message || 'Failed to create initial batch');
                                  else {
                                    setInfo('Initial batch created');
                                    await loadBatches(batchesProduct.id);
                                  }
                                }}
                              >Create Initial Batch</Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ) : (
                    batches.map((b: any) => (
                      <tr key={b.id} className="border-b last:border-b-0">
                        <td className="py-2 px-2">{new Date(b.created_at).toLocaleString()}</td>
                        <td className="px-2">{b.remaining_quantity}</td>
                        <td className="px-2">₱ {Number(b.bought_price).toFixed(2)}</td>
                        <td className="px-2">
                          <Input
                            value={batchEdits[b.id] ?? (b.selling_price != null ? String(Number(b.selling_price).toFixed(2)) : '')}
                            onChange={e => setBatchEdit(b.id, e.target.value)}
                            type="number"
                            step="0.01"
                            min={0}
                            className="w-32"
                          />
                        </td>
                        <td className="px-2"><Button size="sm" onClick={() => saveBatchPrice(b.id)}>Save</Button></td>
                        <td className="px-2">
                          <Button size="sm" variant="destructive" onClick={async () => {
                            const ok = window.confirm('Delete this batch? This cannot be undone.');
                            if (!ok) return;
                            const { error } = await deleteProductBatch(b.id);
                            if (error) setError(error.message || 'Failed to delete batch');
                            else {
                              setInfo('Batch deleted');
                              if (batchesProduct) await loadBatches(batchesProduct.id);
                            }
                          }}>Delete</Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchesOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Offline Queue Dialog */}
      <Dialog open={queueOpen} onOpenChange={setQueueOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Offline Queue</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Queued or failed sales saved locally</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={refreshQueue} disabled={queueLoading}>{queueLoading ? 'Refreshing...' : 'Refresh'}</Button>
                <Button size="sm" onClick={onSyncNow}>Sync now</Button>
              </div>
            </div>
            <div className="border rounded-md overflow-auto max-h-96">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b"><th className="py-2 px-2">When</th><th>Status</th><th>Total</th><th>Items</th><th>Error</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {queueRows.length === 0 ? (
                    <tr><td className="py-4 px-2 text-muted-foreground" colSpan={6}>No queued sales</td></tr>
                  ) : (
                    queueRows.map((row: any) => (
                      <tr key={row.sale.id} className="border-b last:border-b-0">
                        <td className="py-2 px-2">{new Date(row.sale.created_at).toLocaleString()}</td>
                        <td>{row.sale.status}</td>
                        <td>₱ {Number(row.sale.total).toFixed(2)}</td>
                        <td>{row.sale.items_count}</td>
                        <td className="max-w-[240px] truncate" title={row.sale.error || ''}>{row.sale.error || '-'}</td>
                        <td className="flex gap-2">
                          <Button size="sm" onClick={() => onSyncOne(row.sale.id)} disabled={row.sale.status === 'syncing'}>Sync</Button>
                          {row.sale.status === 'syncing' && (
                            <Button size="sm" variant="outline" onClick={() => onResetQueued(row.sale.id)}>Reset</Button>
                          )}
                          <Button size="sm" variant="destructive" onClick={() => onDeleteQueued(row.sale.id)}>Delete</Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQueueOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
