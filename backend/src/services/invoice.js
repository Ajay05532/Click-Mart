// The printable tax invoice (customer order page and admin order drawer). Prices include GST; the tax
// inside them is worked out by orderTax, the same way as the GST report.
import { orderTax, paiseText } from './tax.js'

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => entities[char])
const rupees = (value) => `₹${Number(value ?? 0).toLocaleString('en-IN')}`
const date = (value) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const belowHundred = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`)
const belowThousand = (n) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', belowHundred(n % 100)].filter(Boolean).join(' ')

/** 1387 -> "One Thousand Three Hundred Eighty-Seven Rupees Only" (Indian grouping: thousand, lakh, crore). */
export function rupeesInWords(amount) {
  let n = Math.round(Number(amount) || 0)
  if (n === 0) return 'Zero Rupees Only'
  const parts = []
  const crore = Math.floor(n / 10_000_000)
  n %= 10_000_000
  const lakh = Math.floor(n / 100_000)
  n %= 100_000
  const thousand = Math.floor(n / 1000)
  n %= 1000
  if (crore) parts.push(`${belowThousand(crore)} Crore`)
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`)
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`)
  if (n) parts.push(belowThousand(n))
  return `${parts.join(' ')} Rupees Only`
}

/** @param order a serialized order (serializeOrder). @param settings store settings (getSettings). */
export function renderInvoiceHtml(order, settings) {
  const seller = settings.businessName || settings.storeName || 'ClickMart'
  const tax = orderTax({ discount: order.discount, state: order.address.state }, order.items, settings.businessState)
  const itemsTotal = order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const payment = { UPI: 'UPI', CARD: 'Card', NETBANKING: 'Net banking', COD: 'Cash on delivery' }[order.paymentMethod] ?? order.paymentMethod
  const paid = order.paymentStatus === 'PAID'
  const rows = tax.rows
    .map(
      (row, index) => `<tr>
<td>${index + 1}</td>
<td><strong>${esc(row.name)}</strong><br><span class="muted">${esc(row.size)}</span></td>
<td>${esc(row.hsnCode ?? '—')}</td>
<td class="r">${row.quantity}</td>
<td class="r">${rupees(row.unitPrice)}</td>
<td class="r">${row.rate}%</td>
<td class="r">${paiseText(row.taxable)}</td>
<td class="r">${paiseText(row.tax)}</td>
<td class="r"><strong>${paiseText(row.net)}</strong></td></tr>`,
    )
    .join('')
  const taxLines = tax.intra
    ? `<tr><td>CGST</td><td class="r">${paiseText(tax.cgst)}</td></tr><tr><td>SGST</td><td class="r">${paiseText(tax.sgst)}</td></tr>`
    : `<tr><td>IGST</td><td class="r">${paiseText(tax.igst)}</td></tr>`

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Invoice ${esc(order.code)} · ${esc(seller)}</title>
<style>
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{margin:0;background:#f4f7fb;font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#152033}
.sheet{max-width:820px;margin:24px auto;background:#fff;border:1px solid #e5ebf3;border-radius:14px;padding:32px}
.top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:3px solid #123a86;padding-bottom:18px}
h1{margin:0;font-size:22px;color:#123a86}
.tag{display:inline-block;margin-top:6px;padding:3px 10px;border-radius:999px;background:#e7eefb;color:#123a86;font-weight:800;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.meta{text-align:right}
.meta b{display:block;font-size:15px}
.muted{color:#5e6d82}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:20px 0}
.label{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#5e6d82;margin-bottom:4px}
table{width:100%;border-collapse:collapse}
.items th{background:#f4f7fb;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#5e6d82;text-align:left;padding:8px}
.items td{padding:9px 8px;border-bottom:1px solid #e5ebf3;vertical-align:top}
.r{text-align:right!important;white-space:nowrap}
.sum{display:flex;justify-content:space-between;gap:24px;margin-top:18px}
.sum table td{padding:4px 0}
.totals{min-width:280px}
.grand td{border-top:2px solid #152033;padding-top:8px!important;font-size:16px;font-weight:800}
.words{margin-top:14px;padding:10px 12px;background:#f4f7fb;border-radius:10px}
.foot{margin-top:24px;padding-top:14px;border-top:1px solid #e5ebf3;font-size:11px;color:#5e6d82}
.print{position:fixed;right:18px;bottom:18px;border:0;border-radius:999px;background:#f47b20;color:#fff;font-weight:700;padding:12px 20px;cursor:pointer}
@media print{body{background:#fff}.sheet{border:0;margin:0;padding:0;max-width:none}.print{display:none}}
@media (max-width:640px){.sheet{padding:18px;margin:0;border-radius:0}.grid{grid-template-columns:1fr}.top,.sum{flex-direction:column}.meta{text-align:left}.items{font-size:12px}}
</style></head>
<body><div class="sheet">
<div class="top">
  <div><h1>${esc(seller)}</h1><span class="tag">Tax invoice</span>
    <div class="muted" style="margin-top:8px">${esc(settings.address ?? '')}${settings.gstin ? `<br>GSTIN <strong style="color:#152033">${esc(settings.gstin)}</strong>` : ''}${settings.businessState ? `<br>State: ${esc(settings.businessState)}` : ''}</div>
  </div>
  <div class="meta"><span class="muted">Invoice number</span><b>${esc(order.code)}</b><span class="muted">Invoice date</span><b>${esc(date(order.placedAt))}</b></div>
</div>
<div class="grid">
  <div><div class="label">Bill to</div><strong>${esc(order.customer.name)}</strong><br>${esc(order.customer.phone)}<br>${esc(order.customer.email)}</div>
  <div><div class="label">Ship to</div>${esc(order.address.line)}<br>${esc(order.address.city)}, ${esc(order.address.state)} ${esc(order.address.pin)}</div>
  <div><div class="label">Payment</div>${esc(payment)}${order.payment?.detail ? `<br><span class="muted">${esc(order.payment.detail)}</span>` : ''}<br><strong>${paid ? 'Paid' : order.paymentMethod === 'COD' ? 'Pay on delivery' : esc(order.paymentStatus.toLowerCase())}</strong></div>
</div>
<table class="items"><thead><tr><th>#</th><th>Item</th><th>HSN</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">GST</th><th class="r">Taxable</th><th class="r">Tax</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="sum">
  <div style="flex:1"><div class="label">Tax summary</div><table style="max-width:260px">${taxLines}<tr><td><strong>Total tax</strong></td><td class="r"><strong>${paiseText(tax.tax)}</strong></td></tr></table>
    <p class="muted" style="margin:8px 0 0">Prices include GST.${tax.intra ? ' Intra-state supply.' : settings.businessState ? ' Inter-state supply.' : ''} Coupon savings are spread across items before tax.</p></div>
  <table class="totals">
    <tr><td>Items total</td><td class="r">${rupees(itemsTotal)}</td></tr>
    ${order.discount > 0 ? `<tr><td>${esc(order.couponCode ? `Coupon ${order.couponCode}` : 'Discount')}</td><td class="r">−${rupees(order.discount)}</td></tr>` : ''}
    <tr><td>Delivery</td><td class="r">${order.shipping > 0 ? rupees(order.shipping) : 'Free'}</td></tr>
    <tr class="grand"><td>${paid ? 'Total paid' : 'Total'}</td><td class="r">${rupees(order.total)}</td></tr>
  </table>
</div>
<div class="words"><span class="muted">Amount in words:</span> <strong>${esc(rupeesInWords(order.total))}</strong></div>
<div class="foot">This is a computer-generated invoice and does not need a signature. Questions? ${esc(settings.supportEmail ?? '')} · ${esc(settings.supportPhone ?? '')}</div>
</div>
<button class="print" onclick="window.print()">Print or save as PDF</button>
</body></html>`
}
