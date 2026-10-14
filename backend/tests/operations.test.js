import './setup.js'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { csvCell, istDate, istDateTime, istRange, toCsv } from '../src/utils/csv.js'
import { dailySales, gstSummary, isSale, productsSold } from '../src/services/reports.js'
import { PERMISSION_KEYS, UNGATED_ADMIN_PATHS, cleanPermissions, requiredPermission } from '../src/services/permissions.js'

describe('csv', () => {
  it('quotes, escapes and defuses spreadsheet formulas', () => {
    assert.equal(csvCell('plain'), 'plain')
    assert.equal(csvCell('a,b'), '"a,b"')
    assert.equal(csvCell('say "hi"'), '"say ""hi"""')
    assert.equal(csvCell('line\nbreak'), '"line\nbreak"')
    assert.equal(csvCell('=HYPERLINK("http://evil")'), '"\'=HYPERLINK(""http://evil"")"')
    assert.equal(csvCell('+91 98765'), "'+91 98765")
    assert.equal(csvCell(-250), '-250')
    assert.equal(csvCell(null), '')
    assert.equal(csvCell(true), 'Yes')
  })

  it('writes a BOM, a header row and CRLF lines', () => {
    const out = toCsv(
      [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
      [
        { a: 1, b: 'x' },
        { a: 2, b: 'y,z' },
      ],
    )
    assert.equal(out, '﻿A,B\r\n1,x\r\n2,"y,z"\r\n')
  })

  it('uses Indian dates and day boundaries', () => {
    assert.equal(istDate('2026-10-13T20:00:00Z'), '2026-10-14')
    assert.equal(istDateTime('2026-10-14T12:35:00Z'), '2026-10-14 18:05')
    const range = istRange('2026-10-14', '2026-10-14')
    assert.equal(range.start, '2026-10-13T18:30:00.000Z')
    assert.equal(range.end, '2026-10-14T18:29:59.999Z')
  })
})

const order = (over = {}) => ({
  id: 'o1',
  status: 'DELIVERED',
  paymentStatus: 'PAID',
  paymentMethod: 'UPI',
  state: 'Bihar',
  subtotal: 1000,
  discount: 0,
  shipping: 0,
  total: 1000,
  createdAt: '2026-10-14T05:00:00Z',
  items: [{ quantity: 2 }],
  ...over,
})
const line = (over = {}) => ({ orderId: 'o1', name: 'Almonds', size: '500 g', quantity: 2, unitPrice: 500, hsnCode: '0802', gstPercent: 5, ...over })

describe('reports maths', () => {
  it('counts only paid or COD orders that were not cancelled or returned as sales', () => {
    assert.equal(isSale(order()), true)
    assert.equal(isSale(order({ status: 'CANCELLED' })), false)
    assert.equal(isSale(order({ status: 'RETURNED' })), false)
    assert.equal(isSale(order({ paymentStatus: 'PENDING' })), false)
    assert.equal(isSale(order({ paymentStatus: 'PENDING', paymentMethod: 'COD' })), true)
  })

  it('takes GST out of a GST-inclusive price and splits it CGST/SGST inside the home state', () => {
    const [row, total] = gstSummary([order()], [line()], 'bihar ')
    assert.equal(row.hsn, '0802')
    assert.equal(row.gross, 1000)
    assert.equal(row.taxable, 952.38)
    assert.equal(row.tax, 47.62)
    assert.equal(row.cgst + row.sgst, 47.62)
    assert.equal(row.igst, 0)
    assert.equal(total.hsn, 'Total')
    assert.equal(total.tax, 47.62)
  })

  it('uses IGST for another state and spreads a coupon across the items', () => {
    const result = gstSummary(
      [order({ state: 'Kerala', discount: 100, subtotal: 1000 })],
      [line({ quantity: 1, unitPrice: 600, hsnCode: '0802' }), line({ quantity: 1, unitPrice: 400, hsnCode: '0813', gstPercent: 12 })],
      'Bihar',
    )
    const rows = result.filter((row) => row.hsn === '0802' || row.hsn === '0813')
    assert.equal(
      rows.reduce((sum, row) => sum + row.gross, 0),
      900,
    )
    assert.ok(rows.every((row) => row.cgst === 0 && row.sgst === 0 && row.igst > 0))
    assert.equal(rows.find((row) => row.hsn === '0802').gross, 540)
  })

  it('leaves out cancelled orders and lists delivery charges on their own row', () => {
    const result = gstSummary([order({ shipping: 49 }), order({ id: 'o2', status: 'CANCELLED', shipping: 99 })], [line(), line({ orderId: 'o2' })], 'Bihar')
    assert.equal(result.find((row) => row.hsn === 'Total').quantity, 2)
    assert.equal(result.at(-1).gross, 49)
  })

  it('totals a day and ranks products', () => {
    const days = dailySales([order(), order({ id: 'o2', status: 'CANCELLED' }), order({ id: 'o3', createdAt: '2026-10-15T05:00:00Z', total: 500, subtotal: 500 })])
    assert.equal(days.length, 2)
    assert.deepEqual([days[0].placed, days[0].counted, days[0].cancelled, days[0].items, days[0].total], [2, 1, 1, 2, 1000])
    const sold = productsSold(
      [order(), order({ id: 'o2', status: 'CANCELLED' })],
      [line(), line({ orderId: 'o2', quantity: 5 }), line({ name: 'Cashews', unitPrice: 900, quantity: 1 })],
    )
    assert.equal(sold[0].product, 'Almonds', 'highest sales first')
    assert.equal(sold.find((row) => row.product === 'Almonds').units, 2)
  })
})

describe('permissions', () => {
  it('maps admin URLs to the permission they need', () => {
    assert.equal(requiredPermission('/orders'), 'orders')
    assert.equal(requiredPermission('/orders/abc/status'), 'orders')
    assert.equal(requiredPermission('/products/bulk'), 'catalog')
    assert.equal(requiredPermission('/variants/abc/stock'), 'inventory', 'stock changes need inventory, not catalog')
    assert.equal(requiredPermission('/variants/abc'), 'catalog')
    assert.equal(requiredPermission('/inventory/abc/history'), 'inventory')
    assert.equal(requiredPermission('/reviews/1'), 'marketing')
    assert.equal(requiredPermission('/support/tickets'), 'support')
    assert.equal(requiredPermission('/customers/1'), 'customers')
    assert.equal(requiredPermission('/imports/stock'), 'inventory')
    assert.equal(requiredPermission('/imports/products'), 'catalog')
    assert.equal(requiredPermission('/summary'), null)
  })

  it('keeps only known permission keys', () => {
    assert.deepEqual(cleanPermissions(['orders', 'hack', 'support']), ['orders', 'support'])
    assert.deepEqual(cleanPermissions(null), [])
    assert.ok(PERMISSION_KEYS.includes('reports'))
  })

  it('has a rule or an explicit exemption for every admin route', async () => {
    const { adminRouter } = await import('../src/routes/admin/index.js')
    const found = []
    const walk = (stack) => {
      for (const layer of stack) {
        if (layer.route) found.push(layer.route.path)
        else if (layer.handle?.stack) walk(layer.handle.stack)
      }
    }
    walk(adminRouter.stack)
    assert.ok(found.length > 40, `expected to find the admin routes, found ${found.length}`)
    const open = found.filter(
      (path) =>
        typeof path === 'string' &&
        !requiredPermission(path.replace(/:[A-Za-z]+/g, 'x')) &&
        !UNGATED_ADMIN_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}/`)),
    )
    assert.deepEqual(open, [], 'these admin routes would be open to every staff member: add them to ROUTE_PERMISSIONS or UNGATED_ADMIN_PATHS')
  })
})

describe('printables', async () => {
  const { renderLabels, renderPackingSlips, renderPickList, pickRows } = await import('../src/services/printables.js')
  const store = { storeName: 'ClickMart', businessName: '', address: 'Patna', supportPhone: '+91 90000 00000', supportEmail: 'hi@example.com' }
  const base = {
    id: 'o1',
    number: 1044,
    customerName: 'Asha <script>alert(1)</script>',
    addressLine: '12 Park St & Co',
    city: 'Patna',
    state: 'Bihar',
    pin: '800020',
    phone: '9876543210',
    paymentMethod: 'COD',
    paymentStatus: 'PENDING',
    total: 1397,
    createdAt: '2026-10-14T05:00:00Z',
    couponCode: null,
    items: [
      { name: 'Almonds', size: '500 g', quantity: 2 },
      { name: 'Cashews', size: '250 g', quantity: 1 },
    ],
  }
  const second = { ...base, id: 'o2', number: 1045, paymentMethod: 'UPI', paymentStatus: 'PAID', items: [{ name: 'Almonds', size: '500 g', quantity: 3 }] }

  it('escapes customer text in every document', () => {
    for (const html of [renderPackingSlips([base], store), renderLabels([base], store)]) {
      assert.ok(!html.includes('<script>alert(1)</script>'))
      assert.ok(html.includes('&lt;script&gt;'))
      assert.ok(html.includes('12 Park St &amp; Co'))
    }
  })

  it('tells the packer how much cash to collect, and only for unpaid COD', () => {
    assert.match(renderPackingSlips([base], store), /collect ₹1,397/)
    assert.doesNotMatch(renderPackingSlips([second], store), /Cash on delivery: collect/)
    assert.match(renderLabels([base, second], store), /COD ₹1,397/)
    assert.match(renderLabels([base, second], store), /PREPAID/)
  })

  it('adds every order into one pick list', () => {
    const rows = pickRows([base, second])
    assert.deepEqual(
      rows.map((row) => [row.name, row.units]),
      [
        ['Almonds', 5],
        ['Cashews', 1],
      ],
    )
    assert.match(renderPickList([base, second], store), /#1044 ×2, #1045 ×3/)
  })
})
