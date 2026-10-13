import { createClient } from '@supabase/supabase-js'
import { HttpError } from '../utils/errors.js'
import { env } from '../config/env.js'
export const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})
const tableSchema = {
  Login: 'account',
  Customer: 'account',
  Staff: 'account',
  Admin: 'account',
  Person: 'account',
  RefreshToken: 'account',
  PasswordReset: 'account',
  Address: 'account',
  DeliveryLocation: 'account',
  SavedPayment: 'payment',
  WebhookEvent: 'payment',
  Brand: 'catalog',
  Category: 'catalog',
  Product: 'catalog',
  ProductImage: 'catalog',
  ProductVariant: 'catalog',
  StockMovement: 'catalog',
  Review: 'catalog',
  Coupon: 'marketing',
  CouponProduct: 'marketing',
  CouponCategory: 'marketing',
  CouponRedemption: 'marketing',
  Offer: 'marketing',
  OfferProduct: 'marketing',
  OfferCategory: 'marketing',
  Banner: 'marketing',
  CartItem: 'sales',
  WishlistItem: 'sales',
  Order: 'sales',
  OrderItem: 'sales',
  OrderEvent: 'sales',
  Payment: 'payment',
  Shipment: 'sales',
  Refund: 'payment',
  Setting: 'ops',
  AuditLog: 'ops',
}
export function from(table) {
  return db.schema(tableSchema[table]).from(table)
}
export function toHttpError(error) {
  const { code, message, details, hint } = error
  if (code === '23505') return new HttpError(409, 'That value already exists', details)
  if (code === '23503') return new HttpError(409, 'This record is still in use')
  if (code === '22P02' || code === '22023') return new HttpError(400, 'One of the values is not valid')
  if (code === 'PGRST116') return new HttpError(404, 'Record not found')
  if (code === 'P0001') {
    switch (message) {
      case 'SOLD_OUT':
        return new HttpError(409, `${hint ?? 'An item'} just sold out`, {
          variantId: details,
        })
      case 'COUPON_CLAIMED':
        return new HttpError(400, 'That coupon has been fully claimed')
      case 'NOT_FOUND':
        return new HttpError(404, `${hint ?? 'Record'} not found`)
      case 'BAD_STOCK':
        return new HttpError(400, hint ?? 'Invalid stock change')
      case 'BAD_TRANSITION': {
        const pretty = (value) => (value ?? '').replaceAll('_', ' ').toLowerCase()
        return new HttpError(400, `An order that is ${pretty(details)} cannot move to ${pretty(hint)}`)
      }
    }
  }
  return new Error(`Database error: ${message}${details ? ` (${details})` : ''}`)
}
export async function rows(query) {
  const { data, error } = await query
  if (error) throw toHttpError(error)
  return data ?? []
}
export async function one(query) {
  const { data, error } = await query
  if (error) throw toHttpError(error)
  return data
}
export async function maybe(query) {
  const { data, error } = await query
  if (error) throw toHttpError(error)
  return data ?? null
}
export async function count(query) {
  const { count: total, error } = await query
  if (error) throw toHttpError(error)
  return total ?? 0
}
export async function exec(query) {
  const { error } = await query
  if (error) throw toHttpError(error)
}
export async function rpc(name, args = {}) {
  const { data, error } = await db.rpc(name, args)
  if (error) throw toHttpError(error)
  return data
}
export const nowIso = () => new Date().toISOString()
