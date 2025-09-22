import { supabase } from '@/lib/supabaseClient';

export interface DbProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  barcode?: string | null;
  image?: string | null;
  // Optional cost price stored in DB as snake_case
  bought_price?: number | null;
  created_at: string;
}

// Delete a specific batch by ID
export async function deleteProductBatch(batchId: string) {
  const { error } = await supabase
    .from('product_batches')
    .delete()
    .eq('id', batchId);
  return { error };
}

// Delete all empty (remaining_quantity = 0) batches for a product
export async function deleteEmptyBatches(productId: string) {
  const { error } = await supabase
    .from('product_batches')
    .delete()
    .eq('product_id', productId)
    .eq('remaining_quantity', 0);
  return { error };
}

// Get the next FIFO batch selling price for a product (oldest batch with stock)
export async function getNextBatchPrice(productId: string) {
  const { data, error } = await supabase
    .from('product_batches')
    .select('selling_price, remaining_quantity')
    .eq('product_id', productId)
    .gt('remaining_quantity', 0)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) return { price: null as number | null, error };
  return { price: data ? Number((data as any).selling_price) : null, error: null };
}

/**
 * Quote revenue (no DB writes) for a set of items using FIFO batches and selling_price per batch.
 * Returns { revenue, error }. Does not check/update products.stock.
 */
export async function quoteSaleBatches(items: { productId: string; quantity: number }[]) {
  let totalRevenue = 0;
  for (const it of items) {
    if (it.quantity <= 0) continue;
    const { data: batches, error } = await supabase
      .from('product_batches')
      .select('selling_price, remaining_quantity')
      .eq('product_id', it.productId)
      .gt('remaining_quantity', 0)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (error) return { revenue: 0, error };
    let remaining = it.quantity;
    for (const b of (batches || []) as { selling_price: number; remaining_quantity: number }[]) {
      if (remaining <= 0) break;
      const take = Math.min(b.remaining_quantity, remaining);
      totalRevenue += take * Number(b.selling_price);
      remaining -= take;
    }
    // If remaining > 0, we simply cannot fulfill; still return computed partial revenue.
  }
  return { revenue: totalRevenue, error: null as any };
}

// =========================
// FIFO Consumption (Sales)
// =========================

/**
 * Decrement earliest batches (FIFO) for a product and compute COGS.
 * Returns total consumed (should equal requested qty) and COGS total.
 */
export async function consumeBatchesFIFO(productId: string, quantity: number) {
  if (quantity <= 0) return { consumed: 0, cogs: 0, revenue: 0, error: null as any };
  // Load batches with remaining stock
  const { data: batches, error } = await supabase
    .from('product_batches')
    .select('id, bought_price, selling_price, remaining_quantity')
    .eq('product_id', productId)
    .gt('remaining_quantity', 0)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) return { consumed: 0, cogs: 0, revenue: 0, error };
  let remaining = quantity;
  let cogs = 0;
  let revenue = 0;
  const updates: { id: string; remaining_quantity: number }[] = [];
  for (const b of (batches || []) as { id: string; bought_price: number; selling_price: number; remaining_quantity: number }[]) {
    if (remaining <= 0) break;
    const take = Math.min(b.remaining_quantity, remaining);
    const newRemaining = b.remaining_quantity - take;
    updates.push({ id: b.id, remaining_quantity: newRemaining });
    cogs += take * Number(b.bought_price);
    revenue += take * Number(b.selling_price);
    remaining -= take;
  }
  if (remaining > 0) {
    return { consumed: quantity - remaining, cogs, revenue, error: new Error('Insufficient batch stock') };
  }
  // Apply updates
  for (const u of updates) {
    const { error: updErr } = await supabase
      .from('product_batches')
      .update({ remaining_quantity: u.remaining_quantity })
      .eq('id', u.id);
    if (updErr) return { consumed: quantity - remaining, cogs, revenue, error: updErr };
  }
  return { consumed: quantity, cogs, revenue, error: null as any };
}

/**
 * Process a sale across multiple items: validates stock, consumes batches FIFO, and updates products.stock totals.
 * items: [{ productId, quantity }]
 */
export type SaleConsumeDetail = { productId: string; quantity: number; cogs: number; revenue: number };

export async function processSaleBatches(items: { productId: string; quantity: number }[]) {
  // Validate availability first
  for (const it of items) {
    const { stock, error } = await getProductStock(it.productId);
    if (error) return { cogs: 0, error };
    if ((stock ?? 0) < it.quantity) return { cogs: 0, error: new Error('Insufficient stock for one or more items') };
  }
  let totalCogs = 0;
  let totalRevenue = 0;
  const details: SaleConsumeDetail[] = [];
  // Consume FIFO and update product totals
  for (const it of items) {
    const { consumed, cogs, revenue, error } = await consumeBatchesFIFO(it.productId, it.quantity);
    if (error || consumed !== it.quantity) return { cogs: totalCogs, revenue: totalRevenue, error: error || new Error('Failed to consume batches') };
    totalCogs += cogs;
    totalRevenue += revenue;
    details.push({ productId: it.productId, quantity: it.quantity, cogs, revenue });
    const { error: updErr } = await updateProductStockDelta(it.productId, -it.quantity);
    if (updErr) return { cogs: totalCogs, revenue: totalRevenue, error: updErr };
    // Auto-clean empty batches (best-effort)
    try { await deleteEmptyBatches(it.productId); } catch (_) {}
  }
  return { cogs: totalCogs, revenue: totalRevenue, details, error: null as any };
}

export type NewProductInput = Omit<DbProduct, 'id' | 'created_at'>;

export async function addProduct(input: NewProductInput) {
  const { data, error } = await supabase
    .from('products')
    .insert([{ ...input }])
    .select()
    .single();
  return { data, error } as { data: DbProduct | null; error: any };
}

export async function listProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });
  return { data: (data as DbProduct[]) || [], error };
}

// =========================
// FIFO Batches (Purchases)
// =========================

export interface ProductBatch {
  id: string;
  product_id: string;
  bought_price: number;
  selling_price: number;
  quantity: number;
  remaining_quantity: number;
  created_at: string;
}

export type NewBatchInput = Omit<ProductBatch, 'id' | 'created_at' | 'remaining_quantity'> & {
  remaining_quantity?: number;
};

// Create a purchase batch for a product
export async function createProductBatch(input: NewBatchInput) {
  const payload = {
    product_id: input.product_id,
    bought_price: input.bought_price,
    selling_price: input.selling_price,
    quantity: input.quantity,
    remaining_quantity: input.remaining_quantity ?? input.quantity,
  };
  const { data, error } = await supabase
    .from('product_batches')
    .insert([payload])
    .select()
    .single();
  return { data: data as ProductBatch | null, error };
}

export async function listBatchesByProduct(productId: string) {
  const { data, error } = await supabase
    .from('product_batches')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  return { data: (data as ProductBatch[]) || [], error };
}

// Adds stock to an existing product as a new batch and increments product stock
export async function addStockBatch(productId: string, boughtPrice: number, quantity: number, sellingPrice: number) {
  // 1) create batch
  const { data: batch, error: batchErr } = await createProductBatch({
    product_id: productId,
    bought_price: boughtPrice,
    selling_price: sellingPrice,
    quantity,
  });
  if (batchErr) return { batch: null as ProductBatch | null, error: batchErr };
  // 2) increment product stock (naive read-then-update)
  const { data: prodList, error: selErr } = await supabase
    .from('products')
    .select('id, stock')
    .eq('id', productId)
    .single();
  if (selErr) return { batch, error: selErr };
  const newStock = (prodList?.stock ?? 0) + quantity;
  const { error: updErr } = await supabase
    .from('products')
    .update({ stock: newStock })
    .eq('id', productId);
  return { batch, error: updErr };
}

export async function getProductStock(productId: string) {
  const { data, error } = await supabase
    .from('product_batches')
    .select('remaining_quantity')
    .eq('product_id', productId);
  if (error) return { stock: null as number | null, error };
  const stock = (data as { remaining_quantity: number }[]).reduce((s, r) => s + (r.remaining_quantity || 0), 0);
  return { stock, error: null };
}

export async function updateProductStockDelta(productId: string, delta: number) {
  const { data: prod, error: selErr } = await supabase
    .from('products')
    .select('id, stock')
    .eq('id', productId)
    .single();
  if (selErr) return { error: selErr };
  const newStock = (prod?.stock ?? 0) + delta;
  const { error } = await supabase
    .from('products')
    .update({ stock: newStock })
    .eq('id', productId);
  return { error };
}

// For initial product creation: create a batch equal to initial stock without changing product stock
export async function createInitialBatchForNewProduct(productId: string, boughtPrice: number, quantity: number, sellingPrice?: number) {
  // If sellingPrice not provided, read from products
  let sp = sellingPrice;
  if (sp == null) {
    const { data: prod } = await supabase
      .from('products')
      .select('price')
      .eq('id', productId)
      .single();
    sp = Number(prod?.price ?? 0);
  }
  // products.stock already includes this quantity from the initial insert
  return createProductBatch({
    product_id: productId,
    bought_price: boughtPrice,
    selling_price: sp as number,
    quantity,
    remaining_quantity: quantity,
  });
}

// Update product selling price
export async function updateProductPrice(productId: string, price: number) {
  const { error } = await supabase
    .from('products')
    .update({ price })
    .eq('id', productId);
  return { error };
}

// Update a batch selling price
export async function updateBatchSellingPrice(batchId: string, sellingPrice: number) {
  const { data, error } = await supabase
    .from('product_batches')
    .update({ selling_price: sellingPrice })
    .eq('id', batchId)
    .select('*')
    .single();
  return { data: data as ProductBatch | null, error };
}
