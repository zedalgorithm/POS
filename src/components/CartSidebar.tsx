import { CartItem, PaymentMethod } from '@/types/pos';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Trash2, Minus, Plus, CreditCard, Banknote, Smartphone, Package } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { buildReceiptHTML, printReceipt } from '@/lib/receipt';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { processSaleBatches, quoteSaleBatches } from '@/lib/db';
import { saveQueuedSale } from '@/lib/offlineDB';

interface CartSidebarProps {
  cartItems: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  total: number;
}

export const CartSidebar = ({ 
  cartItems, 
  onUpdateQuantity, 
  onRemoveItem, 
  onClearCart,
  total 
}: CartSidebarProps) => {
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('card');
  const [cashReceived, setCashReceived] = useState<string>('');
  const { toast } = useToast();
  const { user } = useAuth();
  // FIFO-based display prices (unit price per product based on current quantity)
  const [fifoUnitPrices, setFifoUnitPrices] = useState<Record<string, number>>({});

  // Recompute FIFO display unit prices whenever cart items change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        cartItems.map(async (ci) => {
          // Quote revenue for this item's quantity using FIFO
          const { revenue, error } = await quoteSaleBatches([{ productId: ci.product.id, quantity: ci.quantity }]);
          if (error) return [ci.product.id, undefined] as const;
          const unit = ci.quantity > 0 ? revenue / ci.quantity : 0;
          // If unit is non-positive (e.g., no batches or zero selling_price), skip so we fallback to product.price
          if (!unit || unit <= 0 || Number.isNaN(unit)) return [ci.product.id, undefined] as const;
          return [ci.product.id, unit] as const;
        })
      );
      if (cancelled) return;
      const next: Record<string, number> = {};
      for (const [pid, unit] of entries) {
        if (unit != null && !isNaN(unit as number)) next[pid] = unit as number;
      }
      setFifoUnitPrices(next);
    })();
    return () => { cancelled = true; };
  }, [cartItems.map(ci => `${ci.product.id}:${ci.quantity}`).join('|')]);

  const paymentMethods = [
    // { id: 'card' as PaymentMethod, label: 'Card', icon: CreditCard },
    { id: 'cash' as PaymentMethod, label: 'Cash', icon: Banknote },
    { id: 'digital' as PaymentMethod, label: 'Digital', icon: Smartphone },
  ];

  const handleCheckout = () => {
    (async () => {
      if (cartItems.length === 0) {
        toast({
          title: "Cart is empty",
          description: "Please add items to cart before checkout",
          variant: "destructive"
        });
        return;
      }

      // Use FIFO-based subtotal for checkout to match what is displayed
      const subtotalNow = cartItems.reduce((sum, ci) => {
        const unit = fifoUnitPrices[ci.product.id] ?? ci.product.price;
        return sum + unit * ci.quantity;
      }, 0);
      // No tax: charge exactly the subtotal
      const tax = 0;
      const finalTotal = subtotalNow;

      // If cash payment, validate cash received
      let cashNum: number | undefined;
      let change: number | undefined;
      if (selectedPayment === 'cash') {
        cashNum = parseFloat(cashReceived || '0');
        if (isNaN(cashNum) || cashNum <= 0) {
          toast({ title: 'Invalid cash amount', description: 'Enter cash received greater than 0.', variant: 'destructive' });
          return;
        }
        if (cashNum < finalTotal) {
          toast({ title: 'Insufficient cash', description: 'Cash received is less than total.', variant: 'destructive' });
          return;
        }
        change = +(cashNum - finalTotal).toFixed(2);
      }

      let saleId: string | undefined;
      let saleCogs = 0;
      let details: { productId: string; quantity: number; cogs: number; revenue: number }[] = [];
      // Consume inventory using FIFO batches and update product stock
      try {
        const { error: fifoErr, cogs, details: dts } = navigator.onLine
          ? await processSaleBatches(
              cartItems.map(ci => ({ productId: ci.product.id, quantity: ci.quantity }))
            )
          : { error: new Error('offline'), cogs: 0, details: [] } as any;
        if (fifoErr) {
          // If offline: queue sale locally and finish gracefully
          if (fifoErr.message === 'offline' || !navigator.onLine) {
            const itemsToQueue = cartItems.map(ci => {
              const unit = fifoUnitPrices[ci.product.id] ?? ci.product.price;
              return {
                product_id: ci.product.id,
                product_name: ci.product.name,
                category: ci.product.category,
                unit_price: unit,
                quantity: ci.quantity,
                line_total: unit * ci.quantity,
              };
            });
            await saveQueuedSale({
              subtotal: subtotalNow,
              total: finalTotal,
              payment_method: selectedPayment,
              cash_received: cashNum ?? null,
              change: change ?? null,
              items_count: cartItems.reduce((s, ci) => s + ci.quantity, 0),
            }, itemsToQueue as any);
            toast({ title: 'Saved offline', description: 'No internet. Sale queued and will sync automatically when online.' });
            onClearCart(); setCashReceived(''); return;
          } else {
            toast({
              title: 'Insufficient stock',
              description: fifoErr.message || 'Not enough stock to complete the sale.',
              variant: 'destructive',
            });
            return;
          }
        }
        saleCogs = cogs || 0;
        details = dts || [];
      } catch (e: any) {
        // If truly offline, queue sale
        if (!navigator.onLine) {
          const itemsToQueue = cartItems.map(ci => {
            const unit = fifoUnitPrices[ci.product.id] ?? ci.product.price;
            return { product_id: ci.product.id, product_name: ci.product.name, category: ci.product.category, unit_price: unit, quantity: ci.quantity, line_total: unit * ci.quantity };
          });
          await saveQueuedSale({ subtotal: subtotalNow, total: finalTotal, payment_method: selectedPayment, cash_received: cashNum ?? null, change: change ?? null, items_count: cartItems.reduce((s, ci) => s + ci.quantity, 0) }, itemsToQueue as any);
          toast({ title: 'Saved offline', description: 'No internet. Sale queued and will sync automatically when online.' });
          onClearCart(); setCashReceived(''); return;
        }
        toast({ title: 'Stock processing error', description: e?.message || 'Failed to update inventory.', variant: 'destructive' });
        return;
      }
      try {
        // Record sale row for Admin stats (with COGS and item count if columns exist)
        const itemsCount = cartItems.reduce((s, ci) => s + ci.quantity, 0);
        const insertPayload: any = { total: finalTotal, payment_method: selectedPayment, cash_received: cashNum ?? null, change: change ?? null, cogs: saleCogs, items_count: itemsCount };
        let data: any = null; let error: any = null;
        try {
          const resp = await supabase.from('sales').insert([insertPayload]).select('id').single();
          data = resp.data; error = resp.error;
        } catch (e) {
          // fallback if columns missing
          const resp = await supabase.from('sales').insert([{ total: finalTotal }]).select('id').single();
          data = resp.data; error = resp.error;
        }
        if (!error && data?.id) saleId = String(data.id);
        else if (!navigator.onLine || error) {
          // Queue offline if sales insert fails
          const itemsToQueue = cartItems.map(ci => {
            const unit = fifoUnitPrices[ci.product.id] ?? ci.product.price;
            return { product_id: ci.product.id, product_name: ci.product.name, category: ci.product.category, unit_price: unit, quantity: ci.quantity, line_total: unit * ci.quantity };
          });
          await saveQueuedSale({ subtotal: subtotalNow, total: finalTotal, payment_method: selectedPayment, cash_received: cashNum ?? null, change: change ?? null, items_count: itemsCount }, itemsToQueue as any);
          toast({ title: 'Saved offline', description: 'Sale queued and will sync when internet is back.' });
          onClearCart(); setCashReceived(''); return;
        }
      } catch (_) {
        // non-fatal; continue
      }
      // Try to insert sale_items rows if table exists
      if (saleId) {
        try {
          const rows = cartItems.map(ci => {
            const unit = fifoUnitPrices[ci.product.id] ?? ci.product.price;
            const line_total = unit * ci.quantity;
            const found = details.find(d => d.productId === ci.product.id && d.quantity === ci.quantity) || details.find(d => d.productId === ci.product.id);
            const line_cogs = found ? Number(found.cogs) : 0;
            return {
              sale_id: saleId,
              product_id: ci.product.id,
              product_name: ci.product.name,
              category: ci.product.category,
              unit_price: unit,
              quantity: ci.quantity,
              line_total,
              line_cogs,
            };
          });
          await supabase.from('sale_items').insert(rows);
        } catch (_) {
          // ignore if table/columns not present
        }
      }

      // Build and print receipt
      const html = buildReceiptHTML({
        items: cartItems,
        subtotal: subtotalNow,
        tax,
        total: finalTotal,
        paymentMethod: selectedPayment,
        cashReceived: cashNum,
        change,
        cashier: user?.name || user?.username || 'Cashier',
        options: {
          storeName: 'Stock Smart Pulse POS',
          footerNote: 'Thank you for your purchase!',
          printerWidthMm: Number((import.meta as any).env?.VITE_RECEIPT_WIDTH_MM || 58)
        }
      });
      printReceipt(html);

      const extra = selectedPayment === 'cash' && cashNum != null
        ? ` • Cash: ₱${cashNum.toFixed(2)} • Change: ₱${(change ?? 0).toFixed(2)}`
        : '';
      toast({
        title: "Transaction completed!",
        description: `Payment of ₱${finalTotal.toFixed(2)} processed successfully${extra}`,
      });

      onClearCart();
      setCashReceived('');
    })();
  };

  // Display totals based on FIFO unit prices when available
  const displaySubtotal = useMemo(() => {
    return cartItems.reduce((sum, ci) => {
      const unit = fifoUnitPrices[ci.product.id] ?? ci.product.price;
      return sum + unit * ci.quantity;
    }, 0);
  }, [cartItems, fifoUnitPrices]);
  // No tax in totals
  const tax = 0;
  const finalTotal = displaySubtotal;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <span>Cart ({cartItems.length})</span>
          {cartItems.length > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onClearCart}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col">
        {cartItems.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center">
            <div>
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Package className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Your cart is empty</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 mb-6">
              {cartItems.map((item) => (
                <div key={item.product.id} className="bg-accent/50 rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-sm flex-1 pr-2">
                      {item.product.name}
                      <span className="block text-xs text-muted-foreground">Unit: ₱{(fifoUnitPrices[item.product.id] ?? item.product.price).toFixed(2)}</span>
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveItem(item.product.id)}
                      className="h-auto p-1 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                        className="h-8 w-8 p-0"
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      
                      <Badge variant="secondary" className="min-w-[2rem] justify-center">
                        {item.quantity}
                      </Badge>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                        className="h-8 w-8 p-0"
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    
                    <span className="font-semibold text-primary">
                      {(() => {
                        const unit = fifoUnitPrices[item.product.id] ?? item.product.price;
                        return `₱${(unit * item.quantity).toFixed(2)}`;
                      })()}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <Separator />
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>₱{displaySubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total:</span>
                  <span className="text-primary">₱{finalTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-sm">Payment Method</h4>
                <div className="grid grid-cols-3 gap-2">
                  {paymentMethods.map((method) => {
                    const Icon = method.icon;
                    return (
                      <Button
                        key={method.id}
                        variant={selectedPayment === method.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedPayment(method.id)}
                        className="flex flex-col h-auto py-3"
                      >
                        <Icon className="w-4 h-4 mb-1" />
                        <span className="text-xs">{method.label}</span>
                      </Button>
                    );
                  })}
                </div>
                {selectedPayment === 'cash' && (
                  <div className="mt-2">
                    <Label htmlFor="cashReceived">Cash Received</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        id="cashReceived"
                        type="number"
                        min="0"
                        step="0.01"
                        value={cashReceived}
                        onChange={(e) => setCashReceived(e.target.value)}
                        placeholder="0.00"
                        className="flex-1"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => setCashReceived(finalTotal.toFixed(2))}>Exact</Button>
                    </div>
                    {(() => {
                      const c = parseFloat(cashReceived || '0');
                      if (!isNaN(c) && c > 0) {
                        const change = c - finalTotal;
                        return <div className="text-xs text-muted-foreground mt-1">Change: ₱{(isNaN(change) ? 0 : change).toFixed(2)}</div>;
                      }
                      return null;
                    })()}
                  </div>
                )}
              </div>

              <Button 
                onClick={handleCheckout}
                className="w-full h-12 text-base font-semibold"
                size="lg"
                disabled={selectedPayment === 'cash' && (!cashReceived || parseFloat(cashReceived) <= 0)}
              >
                Complete Sale - ₱{finalTotal.toFixed(2)}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};