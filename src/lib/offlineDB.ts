// Lightweight IndexedDB wrapper for offline sales queue
// No external deps

export type QueuedSaleStatus = 'queued' | 'syncing' | 'done' | 'failed';

export interface QueuedSale {
  id: string;
  created_at: string;
  subtotal: number;
  total: number;
  payment_method: string;
  cash_received?: number | null;
  change?: number | null;
  items_count: number;
  status: QueuedSaleStatus;
  error?: string | null;
  status_updated_at?: string | null;
}

export interface QueuedSaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  category?: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
}

const DB_NAME = 'ssp_offline';
const DB_VERSION = 2; // bump for products_cache store
const SALES_STORE = 'queued_sales';
const ITEMS_STORE = 'queued_sale_items';
const PRODUCTS_CACHE_STORE = 'products_cache';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SALES_STORE)) {
        const s = db.createObjectStore(SALES_STORE, { keyPath: 'id' });
        s.createIndex('status', 'status', { unique: false });
        s.createIndex('created_at', 'created_at', { unique: false });
      }
      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        const i = db.createObjectStore(ITEMS_STORE, { keyPath: 'id' });
        i.createIndex('sale_id', 'sale_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(PRODUCTS_CACHE_STORE)) {
        // single-record cache: key='all'
        db.createObjectStore(PRODUCTS_CACHE_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function resetStaleSyncing(thresholdMs = 2 * 60 * 1000) {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SALES_STORE, 'readwrite');
    const store = tx.objectStore(SALES_STORE);
    const idx = store.index('status');
    const cursorReq = idx.openCursor('syncing');
    const now = Date.now();
    cursorReq.onsuccess = (e: any) => {
      const cursor = e.target.result as IDBCursorWithValue | null;
      if (cursor) {
        const val = cursor.value as QueuedSale;
        const updated = val.status_updated_at ? Date.parse(val.status_updated_at) : 0;
        if (!updated || now - updated > thresholdMs) {
          val.status = 'queued';
          val.status_updated_at = new Date().toISOString();
          val.error = val.error || 'Reset stale syncing';
          cursor.update(val);
        }
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

// ----- Products cache helpers -----
export async function saveProductsCache(products: any[]) {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PRODUCTS_CACHE_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(PRODUCTS_CACHE_STORE).put({ key: 'all', products, updated_at: new Date().toISOString() });
  });
}

export async function getProductsCache(): Promise<any[] | null> {
  const db = await openDB();
  const row = await new Promise<any | undefined>((resolve, reject) => {
    const tx = db.transaction(PRODUCTS_CACHE_STORE, 'readonly');
    const req = tx.objectStore(PRODUCTS_CACHE_STORE).get('all');
    req.onsuccess = () => resolve(req.result as any);
    req.onerror = () => reject(req.error);
  });
  return row?.products || null;
}

export async function getQueuedCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SALES_STORE, 'readonly');
    const store = tx.objectStore(SALES_STORE);
    const index = store.index('status');
    let count = 0;
    // Count 'queued'
    const queuedReq = index.openCursor('queued');
    queuedReq.onsuccess = (e: any) => {
      const cursor = e.target.result as IDBCursorWithValue | null;
      if (cursor) { count++; cursor.continue(); } else {
        // Then count 'syncing'
        const syncingReq = index.openCursor('syncing');
        syncingReq.onsuccess = (ev: any) => {
          const cur = ev.target.result as IDBCursorWithValue | null;
          if (cur) { count++; cur.continue(); } else { resolve(count); }
        };
        syncingReq.onerror = () => reject(syncingReq.error);
      }
    };
    queuedReq.onerror = () => reject(queuedReq.error);
  });
}

export async function saveQueuedSale(sale: Omit<QueuedSale, 'id' | 'created_at' | 'status'> & { id?: string; created_at?: string; status?: QueuedSaleStatus }, items: Omit<QueuedSaleItem, 'id' | 'sale_id'>[] & any[]): Promise<string> {
  const id = sale.id || (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  const created_at = sale.created_at || new Date().toISOString();
  const payload: QueuedSale = { id, created_at, subtotal: sale.subtotal, total: sale.total, payment_method: sale.payment_method, cash_received: sale.cash_received ?? null, change: sale.change ?? null, items_count: sale.items_count, status: sale.status || 'queued', error: null, status_updated_at: new Date().toISOString() };
  const withIds: QueuedSaleItem[] = items.map((it) => ({
    id: (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    sale_id: id,
    product_id: it.product_id,
    product_name: it.product_name,
    category: it.category ?? null,
    unit_price: Number(it.unit_price),
    quantity: Number(it.quantity),
    line_total: Number(it.line_total),
  }));
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SALES_STORE, ITEMS_STORE], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(SALES_STORE).put(payload);
    const itemsStore = tx.objectStore(ITEMS_STORE);
    for (const it of withIds) itemsStore.put(it);
  });
  return id;
}

export async function listQueuedSales(): Promise<{ sale: QueuedSale; items: QueuedSaleItem[] }[]> {
  const db = await openDB();
  const sales: QueuedSale[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(SALES_STORE, 'readonly');
    const store = tx.objectStore(SALES_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as any);
    req.onerror = () => reject(req.error);
  });
  const itemsAll: QueuedSaleItem[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(ITEMS_STORE, 'readonly');
    const store = tx.objectStore(ITEMS_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as any);
    req.onerror = () => reject(req.error);
  });
  return sales.map(s => ({ sale: s, items: itemsAll.filter(i => i.sale_id === s.id) }));
}

export async function setSaleStatus(id: string, status: QueuedSaleStatus, error?: string | null) {
  const db = await openDB();
  const sale = await new Promise<QueuedSale | undefined>((resolve, reject) => {
    const tx = db.transaction(SALES_STORE, 'readonly');
    const store = tx.objectStore(SALES_STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as any);
    req.onerror = () => reject(req.error);
  });
  if (!sale) return;
  sale.status = status;
  sale.error = error ?? null;
  sale.status_updated_at = new Date().toISOString();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SALES_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(SALES_STORE).put(sale);
  });
}

export async function deleteQueuedSale(id: string) {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SALES_STORE, ITEMS_STORE], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(SALES_STORE).delete(id);
    const itemsStore = tx.objectStore(ITEMS_STORE);
    const index = itemsStore.index('sale_id');
    const cursorReq = index.openCursor(IDBKeyRange.only(id));
    cursorReq.onsuccess = (e: any) => {
      const cursor = e.target.result as IDBCursorWithValue | null;
      if (cursor) { itemsStore.delete(cursor.primaryKey as any); cursor.continue(); }
    };
  });
}
