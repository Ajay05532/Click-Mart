import { z } from 'zod'
import { from, rpc, rows } from '../database/db.js'
import { badRequest } from '../utils/errors.js'
import { istDate, istDateTime, istRange } from '../utils/csv.js'
import { orderCode } from '../utils/serializers.js'
import { getSettings } from './settings.js'

const PAGE = 1000
const MAX_ROWS = 50_000
const CHUNK = 100

/** PostgREST returns at most 1000 rows, so read page by page. */
export async function fetchAll(makeQuery) {
  const out = []
  for (let page = 0; ; page += 1) {
    const chunk = await rows(makeQuery().range(page * PAGE, page * PAGE + PAGE - 1))
    out.push(...chunk)
    if (chunk.length < PAGE) break
    if (out.length >= MAX_ROWS) throw badRequest('That is too many rows for one file. Choose a shorter date range.')
  }
  return out
}

const chunks = (list, size = CHUNK) => Array.from({ length: Math.ceil(list.length / size) }, (_, index) => list.slice(index * size, index * size + size))

/** Money stored as whole rupees, shown as rupees with two decimals when a report splits tax. */
const rupees = (paise) => Math.round(paise) / 100

/** Orders that count as a sale: not cancelled or returned, and either paid or cash on delivery. */
export const isSale = (order) => order.status !== 'CANCELLED' && order.status !== 'RETURNED' && (order.paymentStatus === 'PAID' || order.paymentMethod === 'COD')

const normaliseState = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/**
 * GST by HSN code and rate. Selling prices include GST (the MRP rule for packed goods), so tax is
 * taken out of what the customer paid. A coupon is spread over the order's items in proportion to
 * their value. All sums are done in paise so the totals add up exactly.
 * Same state as the business: half CGST, half SGST. Different state: IGST.
 */
export function gstSummary(orders, lines, businessState) {
  const home = normaliseState(businessState)
  const byOrder = new Map()
  for (const line of lines) {
    if (!byOrder.has(line.orderId)) byOrder.set(line.orderId, [])
    byOrder.get(line.orderId).push(line)
  }
  const groups = new Map()
  let shipping = 0
  for (const order of orders.filter(isSale)) {
    shipping += order.shipping ?? 0
    const items = byOrder.get(order.id) ?? []
    const gross = items.map((line) => line.unitPrice * line.quantity * 100)
    const goodsTotal = gross.reduce((sum, value) => sum + value, 0)
    const discount = (order.discount ?? 0) * 100
    let given = 0
    items.forEach((line, index) => {
      const share = index === items.length - 1 ? discount - given : goodsTotal ? Math.round((discount * gross[index]) / goodsTotal) : 0
      given += share
      const net = gross[index] - share
      const rate = line.gstPercent ?? 0
      const taxable = Math.round((net * 100) / (100 + rate))
      const tax = net - taxable
      const intra = normaliseState(order.state) === home
      const key = `${line.hsnCode ?? ''}|${rate}`
      const row = groups.get(key) ?? { hsn: line.hsnCode ?? '', rate, quantity: 0, gross: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 }
      row.quantity += line.quantity
      row.gross += net
      row.taxable += taxable
      if (intra) {
        const half = Math.floor(tax / 2)
        row.cgst += half
        row.sgst += tax - half
      } else row.igst += tax
      groups.set(key, row)
    })
  }
  const list = [...groups.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate)
  const out = list.map((row) => ({
    hsn: row.hsn || 'Not set',
    rate: row.rate,
    quantity: row.quantity,
    gross: rupees(row.gross),
    taxable: rupees(row.taxable),
    cgst: rupees(row.cgst),
    sgst: rupees(row.sgst),
    igst: rupees(row.igst),
    tax: rupees(row.cgst + row.sgst + row.igst),
  }))
  const sum = (key) => rupees(list.reduce((total, row) => total + (key === 'tax' ? row.cgst + row.sgst + row.igst : row[key]), 0))
  out.push({
    hsn: 'Total',
    rate: '',
    quantity: list.reduce((total, row) => total + row.quantity, 0),
    gross: sum('gross'),
    taxable: sum('taxable'),
    cgst: sum('cgst'),
    sgst: sum('sgst'),
    igst: sum('igst'),
    tax: sum('tax'),
  })
  out.push({ hsn: 'Delivery charges collected (not split into GST here)', rate: '', quantity: '', gross: shipping, taxable: '', cgst: '', sgst: '', igst: '', tax: '' })
  return out
}

export function dailySales(orders) {
  const days = new Map()
  for (const order of orders) {
    const date = istDate(order.createdAt)
    const day = days.get(date) ?? { date, placed: 0, counted: 0, cancelled: 0, items: 0, sales: 0, discounts: 0, shipping: 0, total: 0 }
    day.placed += 1
    if (order.status === 'CANCELLED' || order.status === 'RETURNED') day.cancelled += 1
    if (isSale(order)) {
      day.counted += 1
      day.items += (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0)
      day.sales += order.subtotal
      day.discounts += order.discount
      day.shipping += order.shipping
      day.total += order.total
    }
    days.set(date, day)
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function productsSold(orders, lines) {
  const sold = new Set(orders.filter(isSale).map((order) => order.id))
  const groups = new Map()
  for (const line of lines.filter((item) => sold.has(item.orderId))) {
    const key = `${line.name}|${line.size}`
    const row = groups.get(key) ?? { product: line.name, size: line.size, hsn: line.hsnCode ?? '', units: 0, orders: new Set(), sales: 0 }
    row.units += line.quantity
    row.orders.add(line.orderId)
    row.sales += line.unitPrice * line.quantity
    groups.set(key, row)
  }
  return [...groups.values()].map((row) => ({ ...row, orders: row.orders.size })).sort((a, b) => b.sales - a.sales)
}

/* ---------------- Loading ---------------- */

async function ordersIn(range, select = '*, items:OrderItem(quantity)') {
  return fetchAll(() => from('Order').select(select).gte('createdAt', range.start).lte('createdAt', range.end).order('createdAt', { ascending: true }).order('id'))
}
async function linesFor(orderIds) {
  const out = []
  for (const part of chunks(orderIds)) out.push(...(await rows(from('OrderItem').select('*').in('orderId', part))))
  return out
}
async function numbersFor(orderIds) {
  const map = new Map()
  for (const part of chunks([...new Set(orderIds)])) for (const order of await rows(from('Order').select('id, number').in('id', part))) map.set(order.id, orderCode(order.number))
  return map
}

const money = (key, label) => ({ key, label, type: 'money' })
const text = (key, label) => ({ key, label })
const number = (key, label) => ({ key, label, type: 'number' })

/** Which permission may run each report. A person needs any one of them. */
export const reports = [
  {
    id: 'orders',
    title: 'Orders',
    description: 'One row per order: customer, address, amounts, payment and courier.',
    range: true,
    access: ['reports'],
    columns: [
      text('order', 'Order'),
      text('placed', 'Placed (IST)'),
      text('status', 'Status'),
      text('paymentStatus', 'Payment status'),
      text('paymentMethod', 'Payment method'),
      text('customer', 'Customer'),
      text('email', 'Email'),
      text('phone', 'Phone'),
      text('city', 'City'),
      text('state', 'State'),
      text('pin', 'PIN'),
      number('items', 'Items'),
      money('subtotal', 'Items total'),
      money('discount', 'Coupon discount'),
      text('coupon', 'Coupon'),
      money('shipping', 'Delivery charge'),
      money('total', 'Order total'),
      text('carrier', 'Courier'),
      text('tracking', 'Tracking number'),
    ],
    async load({ range }) {
      const orders = await ordersIn(range)
      return orders.map((order) => ({
        order: orderCode(order.number),
        placed: istDateTime(order.createdAt),
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        customer: order.customerName,
        email: order.email,
        phone: order.phone,
        city: order.city,
        state: order.state,
        pin: order.pin,
        items: (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
        subtotal: order.subtotal,
        discount: order.discount,
        coupon: order.couponCode ?? '',
        shipping: order.shipping,
        total: order.total,
        carrier: order.carrier ?? '',
        tracking: order.trackingNumber ?? '',
      }))
    },
  },
  {
    id: 'order-lines',
    title: 'Order items',
    description: 'One row per item sold, with HSN code and GST rate. Good for your accountant.',
    range: true,
    access: ['reports'],
    columns: [
      text('order', 'Order'),
      text('placed', 'Placed (IST)'),
      text('status', 'Status'),
      text('product', 'Product'),
      text('size', 'Pack size'),
      number('quantity', 'Quantity'),
      money('unitPrice', 'Unit price'),
      money('lineTotal', 'Line total'),
      text('hsn', 'HSN'),
      number('gst', 'GST %'),
    ],
    async load({ range }) {
      const orders = await ordersIn(range, 'id, number, createdAt, status')
      const byId = new Map(orders.map((order) => [order.id, order]))
      const lines = await linesFor(orders.map((order) => order.id))
      return lines
        .map((line) => ({ line, order: byId.get(line.orderId) }))
        .sort((a, b) => a.order.number - b.order.number)
        .map(({ line, order }) => ({
          order: orderCode(order.number),
          placed: istDateTime(order.createdAt),
          status: order.status,
          product: line.name,
          size: line.size,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.unitPrice * line.quantity,
          hsn: line.hsnCode ?? '',
          gst: line.gstPercent ?? '',
        }))
    },
  },
  {
    id: 'gst',
    title: 'GST summary',
    description: 'Tax collected by HSN code and rate, split into CGST, SGST and IGST. Counts paid or cash-on-delivery orders that were not cancelled or returned.',
    range: true,
    access: ['reports'],
    columns: [
      text('hsn', 'HSN'),
      text('rate', 'GST %'),
      number('quantity', 'Units'),
      money('gross', 'Value paid (incl. GST)'),
      money('taxable', 'Taxable value'),
      money('cgst', 'CGST'),
      money('sgst', 'SGST'),
      money('igst', 'IGST'),
      money('tax', 'Total GST'),
    ],
    async load({ range }) {
      const settings = await getSettings()
      if (!settings.businessState.trim()) throw badRequest('Set your business state in Settings first, so GST can be split into CGST/SGST and IGST.')
      const orders = await ordersIn(range, 'id, status, paymentStatus, paymentMethod, state, shipping, discount')
      const lines = await linesFor(orders.filter(isSale).map((order) => order.id))
      return gstSummary(orders, lines, settings.businessState)
    },
  },
  {
    id: 'sales-daily',
    title: 'Sales by day',
    description: 'Orders, items and money for each day, in Indian time.',
    range: true,
    access: ['reports'],
    columns: [
      text('date', 'Date'),
      number('placed', 'Orders placed'),
      number('counted', 'Orders counted as sales'),
      number('cancelled', 'Cancelled or returned'),
      number('items', 'Items sold'),
      money('sales', 'Items total'),
      money('discounts', 'Coupon discounts'),
      money('shipping', 'Delivery charges'),
      money('total', 'Total collected'),
    ],
    load: async ({ range }) => dailySales(await ordersIn(range)),
  },
  {
    id: 'products-sold',
    title: 'Products sold',
    description: 'Units and sales for each product and pack size, best sellers first.',
    range: true,
    access: ['reports'],
    columns: [text('product', 'Product'), text('size', 'Pack size'), text('hsn', 'HSN'), number('units', 'Units sold'), number('orders', 'Orders'), money('sales', 'Sales')],
    async load({ range }) {
      const orders = await ordersIn(range, 'id, status, paymentStatus, paymentMethod')
      return productsSold(orders, await linesFor(orders.filter(isSale).map((order) => order.id)))
    },
  },
  {
    id: 'stock',
    title: 'Stock and value',
    description: 'Every pack size with its stock, alert level and the value of what is on the shelf.',
    range: false,
    access: ['reports', 'inventory'],
    columns: [
      text('sku', 'SKU'),
      text('product', 'Product'),
      text('size', 'Pack size'),
      text('active', 'Active'),
      number('stock', 'In stock'),
      number('lowStockAt', 'Alert at'),
      money('price', 'Price'),
      money('mrp', 'MRP'),
      money('value', 'Stock value at price'),
      text('status', 'Status'),
    ],
    async load() {
      const settings = await getSettings()
      const variants = await fetchAll(() => from('ProductVariant').select('*, product:Product(name, isActive)').order('sku'))
      return variants.map((variant) => ({
        sku: variant.sku,
        product: variant.product?.name ?? '',
        size: variant.size,
        active: variant.isActive && !!variant.product?.isActive ? 'Yes' : 'No',
        stock: variant.stock,
        lowStockAt: variant.lowStockAt ?? settings.lowStockDefault,
        price: variant.price,
        mrp: variant.mrp,
        value: variant.price * variant.stock,
        status: variant.stock === 0 ? 'Out of stock' : variant.stock <= (variant.lowStockAt ?? settings.lowStockDefault) ? 'Low' : 'OK',
      }))
    },
  },
  {
    id: 'catalog',
    title: 'Catalogue (editable)',
    description: 'Every product and pack size in the same layout as the product import. Edit it in a spreadsheet and import it back.',
    range: false,
    access: ['reports', 'catalog'],
    columns: [
      text('name', 'name'),
      text('category', 'category'),
      text('subcategory', 'subcategory'),
      text('brand', 'brand'),
      text('blurb', 'blurb'),
      text('description', 'description'),
      text('hsn', 'hsn'),
      number('gst', 'gst'),
      text('origin', 'origin'),
      text('ingredients', 'ingredients'),
      number('shelf_life_days', 'shelf_life_days'),
      text('bestseller', 'bestseller'),
      text('active', 'active'),
      text('images', 'images'),
      text('size', 'size'),
      text('variant_active', 'variant_active'),
      text('sku', 'sku'),
      number('price', 'price'),
      number('mrp', 'mrp'),
      number('stock', 'stock'),
      number('weight_grams', 'weight_grams'),
      text('barcode', 'barcode'),
      number('low_stock_at', 'low_stock_at'),
    ],
    async load() {
      const products = await fetchAll(() =>
        from('Product')
          .select('*, variants:ProductVariant(*), category:Category!categoryId(name), subcategory:Category!subcategoryId(name), brand:Brand(name)')
          .order('name')
          .order('id'),
      )
      const out = []
      for (const product of products) {
        const variants = [...(product.variants ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
        for (const variant of variants) {
          out.push({
            name: product.name,
            category: product.category?.name ?? '',
            subcategory: product.subcategory?.name ?? '',
            brand: product.brand?.name ?? '',
            blurb: product.blurb,
            description: product.description,
            hsn: product.hsnCode ?? '',
            gst: product.gstPercent,
            origin: product.countryOfOrigin,
            ingredients: product.ingredients,
            shelf_life_days: product.shelfLifeDays ?? '',
            bestseller: product.isBestseller ? 'yes' : 'no',
            active: product.isActive ? 'yes' : 'no',
            variant_active: variant.isActive ? 'yes' : 'no',
            images: (product.images ?? []).join('|'),
            size: variant.size,
            sku: variant.sku,
            price: variant.price,
            mrp: variant.mrp,
            stock: variant.stock,
            weight_grams: variant.weightGrams ?? '',
            barcode: variant.barcode ?? '',
            low_stock_at: variant.lowStockAt,
          })
        }
      }
      return out
    },
  },
  {
    id: 'customers',
    title: 'Customers',
    description: 'Name, contact details, orders and total spend for every customer.',
    range: false,
    access: ['reports', 'customers'],
    columns: [
      text('name', 'Name'),
      text('email', 'Email'),
      text('phone', 'Phone'),
      text('joined', 'Joined (IST)'),
      number('orders', 'Orders'),
      money('spent', 'Total spent'),
      text('blocked', 'Blocked'),
    ],
    async load() {
      const people = await fetchAll(() => from('Person').select('id, name, email, phone, isBlocked, createdAt').eq('role', 'CUSTOMER').order('createdAt').order('id'))
      const stats = new Map()
      for (const part of chunks(
        people.map((person) => person.id),
        200,
      ))
        for (const stat of (await rpc('customer_stats', { p_user_ids: part })) ?? []) stats.set(stat.userId, stat)
      return people.map((person) => ({
        name: person.name,
        email: person.email,
        phone: person.phone ?? '',
        joined: istDateTime(person.createdAt),
        orders: Number(stats.get(person.id)?.orders ?? 0),
        spent: Number(stats.get(person.id)?.spent ?? 0),
        blocked: person.isBlocked ? 'Yes' : 'No',
      }))
    },
  },
  {
    id: 'payments',
    title: 'Payments and refunds',
    description: 'Every payment attempt and every refund in the period, for matching against your bank and Razorpay.',
    range: true,
    access: ['reports'],
    columns: [
      text('date', 'Date (IST)'),
      text('type', 'Type'),
      text('order', 'Order'),
      text('provider', 'Provider'),
      text('method', 'Method'),
      text('status', 'Status'),
      money('amount', 'Amount'),
      text('detail', 'Paid with'),
      text('paymentId', 'Payment ID'),
      text('providerOrderId', 'Gateway order ID'),
      text('note', 'Note'),
    ],
    async load({ range }) {
      const payments = await fetchAll(() => from('Payment').select('*').gte('createdAt', range.start).lte('createdAt', range.end).order('createdAt').order('id'))
      const refunds = await fetchAll(() => from('Refund').select('*').gte('createdAt', range.start).lte('createdAt', range.end).order('createdAt').order('id'))
      const numbers = await numbersFor([...payments.map((item) => item.orderId), ...refunds.map((item) => item.orderId)])
      return [
        ...payments.map((payment) => ({
          at: payment.createdAt,
          date: istDateTime(payment.createdAt),
          type: 'Payment',
          order: numbers.get(payment.orderId) ?? '',
          provider: payment.provider,
          method: payment.method,
          status: payment.status,
          amount: payment.amount,
          detail: payment.detail ?? '',
          paymentId: payment.providerPaymentId ?? '',
          providerOrderId: payment.providerOrderId ?? '',
          note: payment.failureReason ?? '',
        })),
        ...refunds.map((refund) => ({
          at: refund.createdAt,
          date: istDateTime(refund.createdAt),
          type: 'Refund',
          order: numbers.get(refund.orderId) ?? '',
          provider: '',
          method: '',
          status: refund.status,
          amount: -refund.amount,
          detail: '',
          paymentId: '',
          providerOrderId: '',
          note: refund.reason ?? '',
        })),
      ].sort((a, b) => a.at.localeCompare(b.at))
    },
  },
]

export const findReport = (id) => reports.find((report) => report.id === id)

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates look like 2026-10-14')
export const rangeQuery = z
  .object({ from: day.optional(), to: day.optional() })
  .transform((value) => {
    const today = istDate(new Date().toISOString())
    const to = value.to ?? today
    const from = value.from ?? istDate(new Date(new Date(`${to}T12:00:00+05:30`).getTime() - 29 * 86400_000).toISOString())
    return { from, to }
  })
  .refine((value) => value.from <= value.to, { message: 'The start date must not be after the end date' })
  .refine((value) => (new Date(value.to).getTime() - new Date(value.from).getTime()) / 86400_000 <= 366, { message: 'Choose a range of one year or less' })

export const loadReport = (report, dates) => report.load({ range: istRange(dates.from, dates.to), dates })
