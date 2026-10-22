// Every customer email: one branded layout (tables and inline styles, so Gmail, Outlook and phone apps all
// render it) plus a plain-text copy. Senders never throw; see sendMail.
import { env } from '../config/env.js'
import { ORDER_SELECT } from '../database/selects.js'
import { from, maybe } from '../database/db.js'
import { serializeOrder } from '../utils/serializers.js'
import { sendMail } from './mailer.js'
import { orderTax, paiseText } from './tax.js'
import { getSettings } from './settings.js'

const BRAND = '#123a86'
const ACCENT = '#f47b20'
const INK = '#152033'
const MUTED = '#5e6d82'
const LINE = '#e5ebf3'
const CANVAS = '#f4f7fb'
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const store = () => env.STORE_URL.replace(/\/+$/, '')
const admin = () => env.ADMIN_URL.replace(/\/+$/, '')
const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => entities[char])
export const rupees = (value) => `₹${Number(value ?? 0).toLocaleString('en-IN')}`
const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'there'
const day = (value) => new Date(value).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
const dateTime = (value) => new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
const phone = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '').slice(-10)
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : String(value ?? '')
}
const absolute = (src) => (!src ? '' : /^https?:\/\//.test(src) ? src : `${store()}${src.startsWith('/') ? '' : '/'}${src}`)

const button = (label, url) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="border-radius:999px;background:${ACCENT}"><a href="${esc(url)}" style="display:inline-block;padding:13px 26px;font:700 15px ${FONT};color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)}</a></td></tr></table>`
const para = (html) => `<p style="margin:0 0 14px;font:15px/1.6 ${FONT};color:${INK}">${html}</p>`
const small = (html) => `<p style="margin:0 0 10px;font:13px/1.55 ${FONT};color:${MUTED}">${html}</p>`

/** The shared frame: logo, white card, footer with the shop's contact details. */
function layout({ preheader, heading, body, contact }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${CANVAS}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader ?? '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 4px 18px"><a href="${esc(store())}" style="text-decoration:none"><img src="${esc(`${store()}/logo.png`)}" width="120" alt="ClickMart" style="display:block;border:0;max-width:120px;height:auto;font:800 22px ${FONT};color:${BRAND}"></a></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:20px;padding:32px 28px">
<h1 style="margin:0 0 16px;font:800 24px/1.25 ${FONT};color:${INK}">${esc(heading)}</h1>
${body}
</td></tr>
<tr><td style="padding:22px 8px 0;font:12px/1.6 ${FONT};color:${MUTED};text-align:center">
ClickMart · Premium dry fruits, nuts and seeds, packed fresh in Patna<br>
${contact ? `${esc(contact.phone)} · <a href="mailto:${esc(contact.email)}" style="color:${MUTED}">${esc(contact.email)}</a><br>` : ''}
<a href="${esc(`${store()}/help`)}" style="color:${BRAND}">Help centre</a> · <a href="${esc(`${store()}/orders`)}" style="color:${BRAND}">My orders</a> · <a href="${esc(`${store()}/privacy`)}" style="color:${BRAND}">Privacy</a>
</td></tr>
</table></td></tr></table></body></html>`
}

const storeSettings = () => getSettings().catch(() => null)
const contactOf = (settings) => (settings ? { phone: settings.supportPhone, email: settings.supportEmail } : null)
const contactDetails = async () => contactOf(await storeSettings())
const textFooter = (contact) => `\n\n—\nClickMart · ${store()}${contact ? `\n${contact.phone} · ${contact.email}` : ''}`

/** HTML and plain text for a simple message. Pure, so it can be tested without a database. */
export function renderNotice({ heading, preheader, paragraphs, cta, note }, contact = null) {
  const html = layout({
    preheader,
    heading,
    contact,
    body: paragraphs.map((text) => para(esc(text).replace(/\n/g, '<br>'))).join('') + (cta ? button(cta.label, cta.url) : '') + (note ? small(esc(note)) : ''),
  })
  const text = `${heading}\n\n${paragraphs.join('\n\n')}${cta ? `\n\n${cta.label}: ${cta.url}` : ''}${note ? `\n\n${note}` : ''}${textFooter(contact)}`
  return { html, text }
}

/** A simple message: heading, paragraphs and an optional button. Used for account and support emails. */
export async function noticeEmail({ to, subject, replyTo, idempotencyKey, ...content }) {
  const { html, text } = renderNotice(content, await contactDetails())
  return sendMail(to, subject, text, { html, replyTo, idempotencyKey })
}

/* ---------------- Account ---------------- */

export const sendWelcome = (user) =>
  noticeEmail({
    to: user.email,
    subject: `Welcome to ClickMart, ${firstName(user.name)}`,
    heading: `Welcome, ${firstName(user.name)}!`,
    preheader: 'Your ClickMart account is ready.',
    paragraphs: [
      'Thanks for creating your ClickMart account. We pack premium almonds, cashews, pistachios, raisins and seeds fresh after you order, and deliver across India.',
      'With your account you can track every order in My orders, save addresses for a faster checkout, keep a wishlist, and pay by UPI, card, net banking or cash on delivery.',
    ],
    cta: { label: 'Start shopping', url: `${store()}/shop` },
    note: 'If you did not create this account, reply to this email and we will look into it.',
    idempotencyKey: `welcome/${user.id}`,
  })

/** The 6-digit code for "Forgot password", shown large so it is easy to copy on a phone. */
export function renderResetCode(user, code, minutes, contact = null) {
  const heading = 'Your password reset code'
  const html = layout({
    preheader: `${code} is your ClickMart code. It expires in ${minutes} minutes.`,
    heading,
    contact,
    body:
      para(`Hi ${esc(firstName(user.name))}, use this code to confirm it is you and choose a new password:`) +
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr><td style="padding:16px 26px;background:${CANVAS};border:1px solid ${LINE};border-radius:14px;font:800 34px/1 'SFMono-Regular',Menlo,Consolas,monospace;letter-spacing:10px;color:${INK}">${esc(code)}</td></tr></table>` +
      para(`The code expires in <strong>${minutes} minutes</strong> and stops working after 5 wrong tries.`) +
      small('Never share this code. ClickMart will never ask for it by phone or chat. If you did not ask to reset your password, ignore this email; your password stays the same.'),
  })
  const text = `${heading}\n\nHi ${firstName(user.name)}, your ClickMart code is: ${code}\n\nIt expires in ${minutes} minutes and stops working after 5 wrong tries.\nNever share this code. If you did not ask to reset your password, ignore this email.${textFooter(contact)}`
  return { html, text }
}

export async function sendPasswordResetCode(user, code, minutes) {
  const { html, text } = renderResetCode(user, code, minutes, await contactDetails())
  return sendMail(user.email, `${code} is your ClickMart password reset code`, text, { html })
}

export const sendPasswordChanged = (user) =>
  noticeEmail({
    to: user.email,
    subject: 'Your ClickMart password was changed',
    heading: 'Your password was changed',
    preheader: 'You have been signed out on other devices.',
    paragraphs: [`Hi ${firstName(user.name)},`, `The password for your ClickMart account was changed on ${dateTime(new Date())} IST. For your safety we signed you out on every device.`],
    cta: { label: 'Sign in', url: user.role === 'CUSTOMER' ? `${store()}/login` : `${admin()}/login` },
    note: 'Not you? Reset your password straight away from the sign-in page and contact us.',
  })

export const sendStaffInvite = (user) =>
  noticeEmail({
    to: user.email,
    subject: 'You have been added to the ClickMart admin',
    heading: 'Welcome to the ClickMart team',
    preheader: 'Sign in to the admin to get started.',
    paragraphs: [
      `Hi ${firstName(user.name)},`,
      'An administrator added you to the ClickMart admin. Sign in with this email and the temporary password they gave you, then change it under My account.',
      'Do not have the password? Use "Forgot password" on the sign-in page to set your own.',
    ],
    cta: { label: 'Open the admin', url: `${admin()}/login` },
  })

/* ---------------- Orders ---------------- */

async function loadOrderForEmail(orderId) {
  const row = await maybe(from('Order').select(ORDER_SELECT).eq('id', orderId).maybeSingle())
  return row ? serializeOrder(row) : null
}

const paidOnline = (order) => order.paymentMethod !== 'COD' && (order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED')
const paymentLine = (order) => {
  const method = { UPI: 'UPI', CARD: 'Card', NETBANKING: 'Net banking', COD: 'Cash on delivery' }[order.paymentMethod] ?? order.paymentMethod
  const saved = String(order.payment?.detail ?? '').trim()
  // The saved detail often already starts with the method ("UPI · name@bank"); show it once.
  const label = !saved ? method : saved.toLowerCase().startsWith(method.toLowerCase()) ? saved : `${method} · ${saved}`
  if (order.paymentMethod === 'COD') return order.paymentStatus === 'PAID' ? 'Cash on delivery · paid' : `Cash on delivery · pay ${rupees(order.total)} when it arrives`
  return `${label} · ${order.paymentStatus === 'PAID' ? 'paid' : order.paymentStatus === 'REFUNDED' ? 'refunded' : order.paymentStatus.toLowerCase()}`
}

/** Items, totals, payment and delivery address. The receipt part of the confirmation email. */
function receipt(order, seller = null) {
  const tax = orderTax({ discount: order.discount, state: order.address.state }, order.items, seller?.businessState)
  const itemsTotal = order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const saved = (order.offerDiscount ?? 0) + (order.discount ?? 0)
  const rows = order.items
    .map(
      (item) => `<tr>
<td style="padding:10px 0;border-bottom:1px solid ${LINE};width:56px;vertical-align:top">${item.image ? `<img src="${esc(absolute(item.image))}" width="48" height="48" alt="" style="display:block;border-radius:10px;border:1px solid ${LINE};object-fit:cover">` : ''}</td>
<td style="padding:10px 8px;border-bottom:1px solid ${LINE};font:14px/1.4 ${FONT};color:${INK};vertical-align:top"><strong>${esc(item.name)}</strong><br><span style="color:${MUTED};font-size:13px">${esc(item.size)} · Qty ${item.quantity} · ${rupees(item.unitPrice)} each${item.mrp > item.unitPrice ? ` <span style="text-decoration:line-through">${rupees(item.mrp)}</span>` : ''}</span>${item.hsnCode || item.gstPercent ? `<br><span style="color:${MUTED};font-size:12px">${[item.hsnCode && `HSN ${esc(item.hsnCode)}`, item.gstPercent != null && `GST ${item.gstPercent}%`].filter(Boolean).join(' · ')}</span>` : ''}</td>
<td style="padding:10px 0;border-bottom:1px solid ${LINE};font:700 14px ${FONT};color:${INK};text-align:right;vertical-align:top;white-space:nowrap">${rupees(item.unitPrice * item.quantity)}</td></tr>`,
    )
    .join('')
  const line = (label, value, strong = false, color = INK) =>
    `<tr><td style="padding:4px 0;font:${strong ? 800 : 400} ${strong ? 16 : 14}px ${FONT};color:${strong ? INK : MUTED}">${esc(label)}</td><td style="padding:4px 0;font:${strong ? 800 : 600} ${strong ? 16 : 14}px ${FONT};color:${color};text-align:right;white-space:nowrap">${value}</td></tr>`
  const totals = [
    line(`Items (${order.items.reduce((sum, item) => sum + item.quantity, 0)})`, rupees(itemsTotal)),
    order.discount > 0 ? line(order.couponCode ? `Coupon ${order.couponCode}` : 'Discount', `−${rupees(order.discount)}`, false, '#15803d') : '',
    line('Delivery', order.shipping > 0 ? rupees(order.shipping) : 'Free'),
    `<tr><td colspan="2" style="padding-top:6px;border-top:2px solid ${INK}"></td></tr>`,
    line(order.paymentStatus === 'PAID' ? 'Total paid' : order.paymentMethod === 'COD' ? 'To pay on delivery' : 'Total', rupees(order.total), true),
    tax.tax > 0
      ? `<tr><td colspan="2" style="padding:2px 0;font:12px ${FONT};color:${MUTED}">Includes GST of ${paiseText(tax.tax)}${tax.intra ? ` (CGST ${paiseText(tax.cgst)} + SGST ${paiseText(tax.sgst)})` : seller?.businessState ? ` (IGST)` : ''}</td></tr>`
      : '',
    saved > 0 ? `<tr><td colspan="2" style="padding:8px 0 0;font:700 13px ${FONT};color:#15803d">You saved ${rupees(saved)} on this order</td></tr>` : '',
  ].join('')
  const address = order.address
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 14px;background:${CANVAS};border-radius:14px"><tr>
<td style="padding:14px 16px;font:13px/1.5 ${FONT};color:${MUTED}">Order<br><strong style="font-size:15px;color:${INK}">${esc(order.code)}</strong></td>
<td style="padding:14px 16px;font:13px/1.5 ${FONT};color:${MUTED}">Placed<br><strong style="font-size:15px;color:${INK}">${esc(dateTime(order.placedAt))}</strong></td>
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px">${totals}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr>
<td style="padding:0 10px 0 0;vertical-align:top;width:50%;font:13px/1.55 ${FONT};color:${INK}"><strong style="display:block;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin-bottom:4px">Deliver to</strong>${esc(order.customer.name)}<br>${esc(address.line)}<br>${esc(address.city)}, ${esc(address.state)} ${esc(address.pin)}<br>${esc(phone(order.customer.phone))}</td>
<td style="padding:0 0 0 10px;vertical-align:top;width:50%;font:13px/1.55 ${FONT};color:${INK}"><strong style="display:block;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin-bottom:4px">Payment</strong>${esc(paymentLine(order))}</td>
</tr></table>${
    seller
      ? `<p style="margin:18px 0 0;padding-top:12px;border-top:1px solid ${LINE};font:12px/1.55 ${FONT};color:${MUTED}">Sold by <strong style="color:${INK}">${esc(seller.businessName || seller.storeName || 'ClickMart')}</strong>${seller.address ? `, ${esc(seller.address)}` : ''}${seller.gstin ? ` · GSTIN ${esc(seller.gstin)}` : ''}. Prices include GST.</p>`
      : ''
  }`
}

function receiptText(order, seller = null) {
  const tax = orderTax({ discount: order.discount, state: order.address.state }, order.items, seller?.businessState)
  const lines = order.items.map((item) => `- ${item.name} (${item.size}) x ${item.quantity}: ${rupees(item.unitPrice * item.quantity)}`).join('\n')
  return [
    `Order ${order.code} · placed ${dateTime(order.placedAt)}`,
    '',
    lines,
    '',
    `Items: ${rupees(order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0))}`,
    ...(order.discount > 0 ? [`${order.couponCode ? `Coupon ${order.couponCode}` : 'Discount'}: -${rupees(order.discount)}`] : []),
    `Delivery: ${order.shipping > 0 ? rupees(order.shipping) : 'Free'}`,
    `Total: ${rupees(order.total)}${tax.tax > 0 ? ` (includes GST ${paiseText(tax.tax)})` : ''}`,
    `Payment: ${paymentLine(order)}`,
    '',
    `Deliver to: ${order.customer.name}, ${order.address.line}, ${order.address.city}, ${order.address.state} ${order.address.pin}`,
  ].join('\n')
}

/** HTML and text of the order confirmation with its receipt. Pure, so it can be previewed and tested. */
export function renderOrderConfirmation(order, contact = null, seller = null) {
  const orderUrl = `${store()}/order/${order.code}`
  const heading = `Thank you, ${firstName(order.customer.name)}! Your order is confirmed.`
  const intro =
    order.paymentMethod === 'COD'
      ? `We will pack it fresh and keep you posted at every step. Please keep ${rupees(order.total)} ready for when it arrives.`
      : 'Your payment went through. We will pack your order fresh and keep you posted at every step.'
  const html = layout({
    preheader: `${order.code} · ${rupees(order.total)} · arriving by ${day(order.estimatedDelivery)}`,
    heading,
    contact,
    body:
      para(esc(intro)) +
      para(`<strong>Expected delivery:</strong> by ${esc(day(order.estimatedDelivery))}`) +
      receipt(order, seller) +
      button('View order and invoice', orderUrl) +
      small('Your GST invoice is on the order page (Download invoice). Changed your mind? You can cancel from the order page until it is packed.'),
  })
  const text = `${heading}\n\n${intro}\nExpected delivery: by ${day(order.estimatedDelivery)}\n\n${receiptText(order, seller)}\n\nView order and invoice: ${orderUrl}${textFooter(contact)}`
  return { html, text }
}

/** Order confirmation with the full receipt. Sent once per order (COD at checkout, online once paid). */
export async function sendOrderConfirmation(orderId) {
  const order = await loadOrderForEmail(orderId)
  if (!order?.customer.email) return
  const settings = await storeSettings()
  const { html, text } = renderOrderConfirmation(order, contactOf(settings), settings)
  return sendMail(order.customer.email, `Order confirmed · ${order.code}`, text, { html, idempotencyKey: `order-confirmed/${order.id}` })
}

const statusCopy = {
  PACKED: { subject: 'Your order is packed', heading: 'Packed fresh and ready to ship', intro: 'We have weighed, sealed and quality-checked your order. It will be handed to the courier soon.' },
  SHIPPED: { subject: 'Your order has shipped', heading: 'Your order is on its way', intro: 'Your order has left our Patna kitchen and is with the courier.' },
  OUT_FOR_DELIVERY: { subject: 'Your order is out for delivery', heading: 'Arriving today', intro: 'Your order is out for delivery and should reach you today. Please keep your phone handy for the courier.' },
  DELIVERED: { subject: 'Your order was delivered', heading: 'Delivered. Enjoy!', intro: 'Your order has been delivered. We hope you enjoy every bite.' },
  CANCELLED: { subject: 'Your order was cancelled', heading: 'Your order was cancelled', intro: 'Your order has been cancelled and nothing will be shipped.' },
  RETURNED: { subject: 'We received your return', heading: 'Return received', intro: 'We have received the items you sent back.' },
}

/** One email per delivery step. Placed and confirmed are covered by the confirmation email. */
export async function sendOrderStatus(orderId, status) {
  const copy = statusCopy[status]
  if (!copy) return
  const order = await loadOrderForEmail(orderId)
  if (!order?.customer.email) return
  const contact = await contactDetails()
  const orderUrl = `${store()}/order/${order.code}`
  const extra = []
  if (status === 'SHIPPED' && (order.carrier || order.trackingNumber)) extra.push(`Courier: ${[order.carrier, order.trackingNumber && `tracking number ${order.trackingNumber}`].filter(Boolean).join(', ')}.`)
  if (status === 'SHIPPED' || status === 'PACKED') extra.push(`Expected delivery: by ${day(order.estimatedDelivery)}.`)
  if (status === 'CANCELLED') {
    const reason = [...order.events].reverse().find((event) => event.status === 'CANCELLED')?.note
    if (reason) extra.push(`Reason: ${reason}.`)
    if (paidOnline(order)) extra.push(`The ${rupees(order.total)} you paid is being refunded to your original payment method. Banks usually show it within 5 to 7 working days.`)
  }
  if (status === 'RETURNED' && paidOnline(order)) extra.push(`Your refund of ${rupees(order.total)} will go back to your original payment method once the items are checked.`)
  if (status === 'DELIVERED') extra.push('Something not right? Tell us within 48 hours from the order page and add a photo.')
  const firstProduct = order.items.find((item) => item.slug)
  const cta =
    status === 'DELIVERED' && firstProduct
      ? { label: 'Rate your order', url: `${store()}/product/${firstProduct.slug}` }
      : { label: status === 'CANCELLED' ? 'View order' : 'Track your order', url: orderUrl }
  const summary = order.items.map((item) => `${esc(item.name)} (${esc(item.size)}) × ${item.quantity}`).join('<br>')
  const html = layout({
    preheader: `${order.code} · ${copy.subject}`,
    heading: copy.heading,
    contact,
    body:
      para(`Hi ${esc(firstName(order.customer.name))}, ${esc(copy.intro)}`) +
      extra.map((line) => para(esc(line))).join('') +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0;background:${CANVAS};border-radius:14px"><tr><td style="padding:14px 16px;font:13px/1.6 ${FONT};color:${INK}"><strong>${esc(order.code)}</strong> · ${rupees(order.total)}<br><span style="color:${MUTED}">${summary}</span></td></tr></table>` +
      button(cta.label, cta.url) +
      (status === 'DELIVERED' ? small(`Order page: <a href="${esc(orderUrl)}" style="color:${BRAND}">${esc(orderUrl)}</a>`) : ''),
  })
  const text = `${copy.heading}\n\nHi ${firstName(order.customer.name)}, ${copy.intro}\n${extra.join('\n')}\n\n${order.code} · ${rupees(order.total)}\n${order.items.map((item) => `- ${item.name} (${item.size}) x ${item.quantity}`).join('\n')}\n\n${cta.label}: ${cta.url}${textFooter(contact)}`
  return sendMail(order.customer.email, `${copy.subject} · ${order.code}`, text, { html, idempotencyKey: `order-status/${order.id}/${status}` })
}

/** Refund issued from the admin (cancellations already mention their refund). */
export async function sendRefundIssued(orderId) {
  const order = await loadOrderForEmail(orderId)
  if (!order?.customer.email) return
  return noticeEmail({
    to: order.customer.email,
    subject: `Refund of ${rupees(order.total)} issued · ${order.code}`,
    heading: 'Your refund is on its way',
    preheader: `${rupees(order.total)} for ${order.code}`,
    paragraphs: [
      `Hi ${firstName(order.customer.name)},`,
      `We have refunded ${rupees(order.total)} for order ${order.code} to your original payment method (${paymentLine(order).split(' · ')[0]}).`,
      'Banks usually show the amount within 5 to 7 working days. If it has not arrived by then, reply to this email with your order number.',
    ],
    cta: { label: 'View order', url: `${store()}/order/${order.code}` },
    idempotencyKey: `order-refund/${order.id}`,
  })
}

export { receipt as _receiptForTests }
