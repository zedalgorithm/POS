import { listQueuedSales, setSaleStatus, deleteQueuedSale } from './offlineDB';
import { processSaleBatches } from './db';
import { supabase } from './supabaseClient';

export async function syncQueuedSales(targetId?: string) {
  const all = await listQueuedSales();
  for (const row of all) {
    const { sale, items } = row;
    if (targetId && sale.id !== targetId) continue;
    if (sale.status !== 'queued' && sale.status !== 'failed') continue;
    try {
      await setSaleStatus(sale.id, 'syncing');
      // Recreate items payload for FIFO consumption
      const fifoItems = items.map(it => ({ productId: it.product_id, quantity: it.quantity }));
      const { error: fifoErr, cogs, details } = await processSaleBatches(fifoItems);
      if (fifoErr) {
        await setSaleStatus(sale.id, 'failed', fifoErr.message || 'FIFO error');
        console.error('Sync FIFO error', fifoErr);
        continue;
      }
      // Insert sale row
      const insertPayload: any = {
        total: sale.total,
        payment_method: sale.payment_method,
        cash_received: sale.cash_received ?? null,
        change: sale.change ?? null,
        cogs: cogs || 0,
        items_count: sale.items_count || items.reduce((s, it) => s + (it.quantity || 0), 0),
      };
      const { data: saleIns, error: sErr } = await supabase
        .from('sales')
        .insert([insertPayload])
        .select('id')
        .single();
      if (sErr || !saleIns?.id) {
        await setSaleStatus(sale.id, 'failed', sErr?.message || 'Insert sales failed');
        if (sErr) console.error('Sync sales insert error', sErr);
        continue;
      }
      const saleId = String(saleIns.id);
      // Insert sale_items
      try {
        const rows = items.map(it => ({
          sale_id: saleId,
          product_id: it.product_id,
          product_name: it.product_name,
          category: it.category ?? null,
          unit_price: it.unit_price,
          quantity: it.quantity,
          line_total: it.line_total,
          line_cogs: (details?.find(d => d.productId === it.product_id)?.cogs ?? 0),
        }));
        await supabase.from('sale_items').insert(rows);
      } catch (e) {
        // ignore if table not present
        console.warn('sale_items insert failed (ignored):', e);
      }
      // Mark done before deleting in case deletion fails
      await setSaleStatus(sale.id, 'done');
      await deleteQueuedSale(sale.id);
    } catch (e: any) {
      await setSaleStatus(sale.id, 'failed', e?.message || 'Sync error');
      console.error('Sync error', e);
    }
  }
}
