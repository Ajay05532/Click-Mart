import { escapeHtml as esc } from '../utils/html.js'
import { istDateTime } from '../utils/csv.js'
import { orderCode } from '../utils/serializers.js'

export const PRINT_KINDS = ['packing-slips', 'pick-list', 'labels']

const shell = (title, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 13px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #152033; background: #eef2f8; }
  .bar { position: sticky; top: 0; z-index: 5; display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 10px 16px; background: #123a86; color: #fff; }
  .bar button { border: 0; border-radius: 999px; background: #f47b20; color: #fff; font: 700 13px system-ui; padding: 9px 20px; cursor: pointer; }
  .sheet { max-width: 190mm; margin: 14px auto; background: #fff; padding: 10mm; box-shadow: 0 2px 12px rgb(21 32 51 / .12); }
  h1 { margin: 0; font-size: 22px; } h2 { margin: 0 0 6px; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #5e6d82; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { padding: 7px 8px; border-bottom: 1px solid #dfe6f0; text-align: left; vertical-align: top; }
  th { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #5e6d82; border-bottom: 2px solid #152033; }
  .r { text-align: right; } .c { text-align: center; } .muted { color: #5e6d82; } .mono { font-family: ui-monospace, Menlo, monospace; }
  .box { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #152033; border-radius: 3px; }
  .cod { margin-top: 12px; padding: 10px 14px; border: 2px solid #152033; border-radius: 8px; font-size: 16px; font-weight: 800; }
  .slip { page-break-after: always; } .slip:last-child { page-break-after: auto; }
  .head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; border-bottom: 3px solid #f47b20; padding-bottom: 10px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 14px; }
  .labels { display: grid; grid-template-columns: 1fr 1fr; gap: 0; padding: 0; }
  .label { height: 57mm; padding: 4mm 6mm; font-size: 12px; line-height: 1.35; border: 1px dashed #9aa6b8; overflow: hidden; page-break-inside: avoid; }
  .label .to { font-size: 14px; font-weight: 800; } .label .pin { font-size: 20px; font-weight: 900; letter-spacing: .06em; margin-top: 2px; }
  .label .from { margin-top: 5px; padding-top: 4px; border-top: 1px solid #dfe6f0; font-size: 10px; color: #5e6d82; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag { display: inline-block; margin-top: 4px; padding: 2px 8px; border: 2px solid #152033; border-radius: 6px; font-weight: 800; font-size: 12px; }
  @media print { body { background: #fff; } .bar { display: none; } .sheet { margin: 0; padding: 0; box-shadow: none; max-width: none; } .label { border-color: #bbb; } }
</style></head>
<body>
<div class="bar"><strong>${esc(title)}</strong><button type="button" onclick="window.print()">Print</button></div>
${body}
</body></html>`

const money = (value) => `₹${Number(value).toLocaleString('en-IN')}`
const address = (order) => `${esc(order.addressLine)}<br>${esc(order.city)}, ${esc(order.state)}`
const owesCash = (order) => order.paymentMethod === 'COD' && order.paymentStatus !== 'PAID'
const storeName = (store) => store.businessName || store.storeName

export function renderPackingSlips(orders, store) {
  const slips = orders
    .map((order) => {
      const lines = order.items
        .map(
          (item) =>
            `<tr><td class="c"><span class="box"></span></td><td><strong>${esc(item.name)}</strong></td><td>${esc(item.size)}</td><td class="r"><strong>${item.quantity}</strong></td></tr>`,
        )
        .join('')
      const units = order.items.reduce((sum, item) => sum + item.quantity, 0)
      return `<section class="sheet slip">
  <div class="head">
    <div><h1>${esc(storeName(store))}</h1><div class="muted">${esc(store.address)}<br>${esc(store.supportPhone)}</div></div>
    <div class="r"><h2>Packing slip</h2><div class="mono" style="font-size:20px;font-weight:800">${esc(orderCode(order.number))}</div><div class="muted">${esc(istDateTime(order.createdAt))}</div></div>
  </div>
  <div class="grid2">
    <div><h2>Ship to</h2><strong>${esc(order.customerName)}</strong><br>${address(order)} ${esc(order.pin)}<br>${esc(order.phone)}</div>
    <div><h2>Order</h2>Payment: <strong>${esc(order.paymentMethod)}${owesCash(order) ? '' : ` · ${esc(order.paymentStatus)}`}</strong><br>Items: <strong>${units}</strong>${order.couponCode ? `<br>Coupon: ${esc(order.couponCode)}` : ''}</div>
  </div>
  <table><tr><th class="c" style="width:34px">Packed</th><th>Item</th><th>Pack size</th><th class="r" style="width:60px">Qty</th></tr>${lines}</table>
  ${owesCash(order) ? `<div class="cod">Cash on delivery: collect ${money(order.total)}</div>` : ''}
  <p class="muted" style="margin-top:18px">Packed by ______________________ &nbsp; Checked by ______________________</p>
  <p class="muted">Thank you for shopping with ${esc(storeName(store))}. Questions about this order? ${esc(store.supportPhone)}${store.supportEmail ? ` · ${esc(store.supportEmail)}` : ''}</p>
</section>`
    })
    .join('\n')
  return shell(`Packing slips (${orders.length})`, slips)
}

/** Adds up every order's items so one walk through the shelves fills all of them. */
export function pickRows(orders) {
  const groups = new Map()
  for (const order of orders) {
    for (const item of order.items) {
      const key = `${item.name}|${item.size}`
      const row = groups.get(key) ?? { name: item.name, size: item.size, units: 0, orders: [] }
      row.units += item.quantity
      row.orders.push({ code: orderCode(order.number), quantity: item.quantity })
      groups.set(key, row)
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name) || a.size.localeCompare(b.size, undefined, { numeric: true }))
}

export function renderPickList(orders, store) {
  const list = pickRows(orders)
  const total = list.reduce((sum, row) => sum + row.units, 0)
  const body = list
    .map(
      (row) =>
        `<tr><td class="c"><span class="box"></span></td><td><strong>${esc(row.name)}</strong></td><td>${esc(row.size)}</td><td class="r" style="font-size:16px"><strong>${row.units}</strong></td><td class="muted">${row.orders.map((entry) => `${esc(entry.code.replace('ORD-', '#'))}${entry.quantity > 1 ? ` ×${entry.quantity}` : ''}`).join(', ')}</td></tr>`,
    )
    .join('')
  return shell(
    `Pick list (${orders.length} orders)`,
    `<section class="sheet">
  <div class="head"><div><h1>Pick list</h1><div class="muted">${esc(storeName(store))}</div></div><div class="r"><strong>${orders.length}</strong> orders<br><strong>${total}</strong> units<br><span class="muted">${esc(istDateTime(new Date().toISOString()))}</span></div></div>
  <table><tr><th class="c" style="width:34px">Got</th><th>Product</th><th>Pack size</th><th class="r" style="width:60px">Total</th><th>For orders</th></tr>${body}</table>
</section>`,
  )
}

export function renderLabels(orders, store) {
  const cells = orders
    .map(
      (order) => `<div class="label">
  <div class="muted" style="font-size:10px;letter-spacing:.1em">SHIP TO</div>
  <div class="to">${esc(order.customerName)}</div>
  <div>${address(order)}</div>
  <div class="pin">${esc(order.pin)}</div>
  <div>Phone: <strong>${esc(order.phone)}</strong></div>
  <div><span class="mono"><strong>${esc(orderCode(order.number))}</strong></span>${owesCash(order) ? ` <span class="tag">COD ${money(order.total)}</span>` : ' <span class="tag">PREPAID</span>'}</div>
  <div class="from">From: ${esc(storeName(store))} · ${esc(store.supportPhone)}</div>
</div>`,
    )
    .join('\n')
  return shell(`Address labels (${orders.length})`, `<section class="sheet labels">${cells}</section>`)
}

export const renderers = { 'packing-slips': renderPackingSlips, 'pick-list': renderPickList, labels: renderLabels }
