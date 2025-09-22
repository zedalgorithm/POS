import type { CartItem, PaymentMethod } from "@/types/pos";

export interface ReceiptOptions {
  storeName?: string;
  addressLine1?: string;
  addressLine2?: string;
  footerNote?: string;
  /** Thermal printer paper width in millimeters (common sizes: 58 or 80). Default: 58 */
  printerWidthMm?: number;
}

export function buildReceiptHTML(params: {
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  saleId?: string;
  date?: Date;
  options?: ReceiptOptions;
  cashReceived?: number;
  change?: number;
  cashier?: string;
}): string {
  const { items, subtotal, tax, total, paymentMethod, saleId, date, options, cashReceived, change, cashier } = params;
  const d = date || new Date();
  const widthMm = (options?.printerWidthMm && options.printerWidthMm > 0) ? options.printerWidthMm : 58;
  // Typical printable area is a bit less than paper width; keep small side padding
  const bodyPaddingMm = 3;
  const opts: Required<Omit<ReceiptOptions, 'printerWidthMm'>> & { printerWidthMm: number } = {
    storeName: options?.storeName || "Stock Smart Pulse POS",
    addressLine1: options?.addressLine1 || "",
    addressLine2: options?.addressLine2 || "",
    footerNote: options?.footerNote || "Thank you for your purchase!",
    printerWidthMm: widthMm,
  };

  const rows = items
    .map(
      (it) => `
        <tr>
          <td>${escapeHtml(it.product.name)}</td>
          <td class="right">${it.quantity}</td>
          <td class="right">₱${it.product.price.toFixed(2)}</td>
          <td class="right">₱${(it.product.price * it.quantity).toFixed(2)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Receipt</title>
  <style>
    @page { size: ${opts.printerWidthMm}mm auto; margin: 0; }
    body { width: ${opts.printerWidthMm}mm; margin: 0; padding: ${bodyPaddingMm}mm; color: #111; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .center { text-align: center; }
    .right { text-align: right; }
    .muted { color: #444; font-size: 10px; }
    h1 { font-size: 12px; margin: 0 0 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: fixed; }
    th, td { padding: 2px 0; word-wrap: break-word; }
    th:first-child, td:first-child { width: 55%; }
    th:nth-child(2), td:nth-child(2) { width: 10%; }
    th:nth-child(3), td:nth-child(3) { width: 15%; }
    th:nth-child(4), td:nth-child(4) { width: 20%; }
    .totals td { padding-top: 4px; }
    .divider { border-top: 1px dashed #999; margin: 6px 0; }
    @media print { body { padding: ${bodyPaddingMm}mm; } }
  </style>
</head>
<body>
  <div class="center">
    <h1>${escapeHtml(opts.storeName)}</h1>
    ${opts.addressLine1 ? `<div class="muted">${escapeHtml(opts.addressLine1)}</div>` : ""}
    ${opts.addressLine2 ? `<div class="muted">${escapeHtml(opts.addressLine2)}</div>` : ""}
  </div>
  <div class="divider"></div>
  <div class="muted">${d.toLocaleString()}</div>
  ${saleId ? `<div class="muted">Sale ID: ${escapeHtml(saleId)}</div>` : ""}
  ${cashier ? `<div class=\"muted\">Cashier: ${escapeHtml(cashier)}</div>` : ""}
  <div style="height:6px"></div>
  <table>
    <thead>
      <tr>
        <th class="left">Item</th>
        <th class="right">Qty</th>
        <th class="right">Price</th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
    <tfoot>
      <tr class="totals"><td colspan="3" class="right">Subtotal</td><td class="right">₱${subtotal.toFixed(2)}</td></tr>
      <tr><td colspan="3" class="right">Tax</td><td class="right">₱${tax.toFixed(2)}</td></tr>
      <tr><td colspan="3" class="right"><strong>Total</strong></td><td class="right"><strong>₱${total.toFixed(2)}</strong></td></tr>
      <tr><td colspan="3" class="right">Payment</td><td class="right">${escapeHtml(paymentMethod)}</td></tr>
      ${typeof cashReceived === 'number' ? `<tr><td colspan="3" class="right">Cash Received</td><td class="right">₱${cashReceived.toFixed(2)}</td></tr>` : ''}
      ${typeof change === 'number' ? `<tr><td colspan="3" class="right">Change</td><td class="right">₱${change.toFixed(2)}</td></tr>` : ''}
    </tfoot>
  </table>
  <div class="divider"></div>
  <div class="center muted">${escapeHtml(opts.footerNote)}</div>
  <script>
    window.onload = () => {
      window.focus();
      window.print();
      setTimeout(() => window.close(), 300);
    };
  </script>
</body>
</html>`;
}

export function printReceipt(html: string) {
  const w = window.open("", "_blank", "width=360,height=640");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
