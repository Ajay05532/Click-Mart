// GST inside one order, for the receipt email and the invoice. Same rules as gstSummary in reports.js:
// selling prices include GST, a coupon is spread over the items in proportion to their value (the last item
// takes the rounding remainder), and delivery inside the business state splits into CGST + SGST, else IGST.
// Amounts are in paise to avoid rounding drift.

const normaliseState = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** @param lines items with unitPrice, quantity, gstPercent and hsnCode. @returns per-line and total tax in paise. */
export function orderTax({ discount = 0, state }, lines, businessState) {
  const gross = lines.map((line) => line.unitPrice * line.quantity * 100)
  const goodsTotal = gross.reduce((sum, value) => sum + value, 0)
  const coupon = (discount ?? 0) * 100
  const intra = Boolean(businessState) && normaliseState(state) === normaliseState(businessState)
  let given = 0
  const rows = lines.map((line, index) => {
    const share = index === lines.length - 1 ? coupon - given : goodsTotal ? Math.round((coupon * gross[index]) / goodsTotal) : 0
    given += share
    const net = gross[index] - share
    const rate = line.gstPercent ?? 0
    const taxable = Math.round((net * 100) / (100 + rate))
    return { ...line, rate, net, taxable, tax: net - taxable }
  })
  const tax = rows.reduce((sum, row) => sum + row.tax, 0)
  const cgst = intra ? rows.reduce((sum, row) => sum + Math.floor(row.tax / 2), 0) : 0
  return {
    rows,
    intra,
    net: rows.reduce((sum, row) => sum + row.net, 0),
    taxable: rows.reduce((sum, row) => sum + row.taxable, 0),
    tax,
    cgst,
    sgst: intra ? tax - cgst : 0,
    igst: intra ? 0 : tax,
  }
}

/** ₹1,234.50 from paise, always two decimals (for tax lines). */
export const paiseText = (paise) => `₹${(Math.round(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
