import './setup.js'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { _receiptForTests as receipt, esc, renderNotice, renderResetCode, rupees } from '../src/services/emails.js'
import { renderInvoiceHtml, rupeesInWords } from '../src/services/invoice.js'
import { gstSummary } from '../src/services/reports.js'
import { orderTax } from '../src/services/tax.js'
import { mailProvider, sendMail, testMailbox } from '../src/services/mailer.js'

const order = {
  id: 'o1',
  code: 'ORD-7',
  placedAt: '2026-10-21T10:30:00.000Z',
  estimatedDelivery: '2026-10-25T10:30:00.000Z',
  paymentMethod: 'UPI',
  paymentStatus: 'PAID',
  payment: { detail: 'UPI · ajay@upi' },
  customer: { name: 'Ajay Singh', email: 'a@example.com', phone: '9162384894' },
  address: { line: 'House 196, Nisha Nagar', city: 'Dumraon', state: 'Bihar', pin: '802136' },
  items: [
    { name: 'Almonds', size: '250g', quantity: 2, unitPrice: 599, mrp: 999, image: '/images/almonds.jpg', slug: 'almonds', hsnCode: '0802', gstPercent: 5 },
    { name: '<script>x</script>', size: '1kg', quantity: 1, unitPrice: 999, mrp: 999, image: null, hsnCode: '0813', gstPercent: 12 },
  ],
  subtotal: 2197,
  offerDiscount: 0,
  discount: 220,
  couponCode: 'DRY15',
  shipping: 0,
  total: 1977,
  events: [],
}

describe('email templates', () => {
  it('formats rupees the Indian way and escapes text', () => {
    assert.equal(rupees(125000), '₹1,25,000')
    assert.equal(esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;')
  })

  it('builds a receipt with every line, the coupon, free delivery and the paid total', () => {
    const html = receipt(order)
    assert.match(html, /ORD-7/)
    assert.match(html, /Almonds/)
    assert.match(html, /₹1,198/, 'line total is price × quantity')
    assert.match(html, /Coupon DRY15/)
    assert.match(html, /−₹220/)
    assert.match(html, />Free</)
    assert.match(html, /Total paid/)
    assert.match(html, /₹1,977/)
    assert.match(html, /Dumraon, Bihar 802136/)
    assert.match(html, /\+91 91623 84894/)
    assert.match(html, />UPI · ajay@upi · paid</, 'payment method is not repeated')
    assert.match(html, /src="http:\/\/localhost:5173\/images\/almonds\.jpg"/, 'relative images become absolute')
    assert.ok(!html.includes('<script>x</script>'), 'product names are escaped')
  })

  it('says what to pay on delivery for a cash order', () => {
    const html = receipt({ ...order, paymentMethod: 'COD', paymentStatus: 'PENDING', payment: null })
    assert.match(html, /To pay on delivery/)
    assert.match(html, /Cash on delivery · pay ₹1,977 when it arrives/)
  })

  it('renders a notice with a button, a plain-text copy and contact details', () => {
    const { html, text } = renderNotice(
      { heading: 'Reset your password', paragraphs: ['Hi <Ajay>,', 'Line one\nline two'], cta: { label: 'Choose a new password', url: 'https://theclickmart.com/reset-password?token=abc&x=1' }, note: 'Ignore if not you.' },
      { phone: '+91 93048 37512', email: 'help@theclickmart.com' },
    )
    assert.match(html, /<h1[^>]*>Reset your password<\/h1>/)
    assert.match(html, /Hi &lt;Ajay&gt;,/)
    assert.match(html, /Line one<br>line two/)
    assert.match(html, /href="https:\/\/theclickmart\.com\/reset-password\?token=abc&amp;x=1"/)
    assert.match(html, /\+91 93048 37512/)
    assert.match(text, /Choose a new password: https:\/\/theclickmart\.com\/reset-password\?token=abc&x=1/)
    assert.match(text, /help@theclickmart\.com/)
  })
})

describe('mailer', () => {
  it('records emails instead of sending them in tests', async () => {
    assert.equal(typeof mailProvider, 'string')
    const before = testMailbox.length
    const result = await sendMail('a@example.com', 'Hello', 'Plain', { html: '<p>Hi</p>', replyTo: 'help@example.com' })
    assert.equal(result.ok, true)
    assert.deepEqual(testMailbox.at(-1), { to: 'a@example.com', subject: 'Hello', text: 'Plain', html: '<p>Hi</p>', replyTo: 'help@example.com' })
    assert.equal(testMailbox.length, before + 1)
  })
})

const seller = { storeName: 'ClickMart', businessName: 'ClickMart Foods', gstin: '10ABCDE1234F1Z5', businessState: 'Bihar', address: 'Patna, Bihar 804453', supportEmail: 'help@example.com', supportPhone: '+91 93048 37512' }

describe('receipt GST and invoice', () => {
  it('works out GST exactly like the GST report, with the coupon spread over the items', () => {
    const mine = orderTax({ discount: order.discount, state: order.address.state }, order.items, 'Bihar')
    const report = gstSummary(
      [{ id: 'o1', status: 'CONFIRMED', paymentStatus: 'PAID', paymentMethod: 'UPI', state: 'Bihar', discount: order.discount, shipping: 0 }],
      order.items.map((item) => ({ ...item, orderId: 'o1' })),
      'Bihar',
    )
    const total = report.find((row) => row.hsn === 'Total')
    assert.equal(mine.tax / 100, total.tax)
    assert.equal(mine.taxable / 100, total.taxable)
    assert.equal(mine.net / 100, order.total)
    assert.equal(mine.cgst + mine.sgst, mine.tax)
    assert.equal(orderTax({ discount: 0, state: 'Kerala' }, order.items, 'Bihar').igst > 0, true)
  })

  it('shows HSN, GST included, the savings and the seller on the receipt', () => {
    const html = receipt(order, seller)
    assert.match(html, /HSN 0802 · GST 5%/)
    assert.match(html, /Includes GST of ₹[\d,]+\.\d\d \(CGST ₹[\d,.]+ \+ SGST ₹[\d,.]+\)/)
    assert.match(html, /You saved ₹220 on this order/)
    assert.match(html, /Sold by <strong[^>]*>ClickMart Foods<\/strong>, Patna, Bihar 804453 · GSTIN 10ABCDE1234F1Z5/)
    assert.match(html, /line-through">₹999/, 'MRP is struck through when the price is lower')
  })

  it('writes amounts in words the Indian way', () => {
    assert.equal(rupeesInWords(1977), 'One Thousand Nine Hundred Seventy-Seven Rupees Only')
    assert.equal(rupeesInWords(125000), 'One Lakh Twenty-Five Thousand Rupees Only')
    assert.equal(rupeesInWords(20500000), 'Two Crore Five Lakh Rupees Only')
    assert.equal(rupeesInWords(0), 'Zero Rupees Only')
  })

  it('prints a tax invoice with the seller, GSTIN, tax split and escaped items', () => {
    const html = renderInvoiceHtml(order, seller)
    assert.match(html, /Tax invoice/)
    assert.match(html, /ClickMart Foods/)
    assert.match(html, /GSTIN <strong[^>]*>10ABCDE1234F1Z5/)
    assert.match(html, /<td>CGST<\/td>/)
    assert.match(html, /One Thousand Nine Hundred Seventy-Seven Rupees Only/)
    assert.ok(!html.includes('<script>x</script>'))
    assert.match(renderInvoiceHtml({ ...order, address: { ...order.address, state: 'Kerala' } }, seller), /<td>IGST<\/td>/)
  })

  it('shows the reset code large, with how long it lasts', () => {
    const { html, text } = renderResetCode({ name: 'Ajay Singh' }, '048213', 10)
    assert.match(html, />048213</)
    assert.match(html, /10 minutes/)
    assert.match(text, /your ClickMart code is: 048213/)
  })
})
