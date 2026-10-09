import { createClient, type PostgrestError } from '@supabase/supabase-js'
import { HttpError } from './errors.js'
import { env } from './env.js'

/** Server-side client. The service key bypasses Row Level Security, so it must never leave the backend. */
export const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

/** Which Postgres schema holds each table. Related data stays together; nothing app-owned lives in public. */
const tableSchema = {
  Login: 'account',
  Customer: 'account',
  Staff: 'account',
  Admin: 'account',
  Person: 'account',
  RefreshToken: 'account',
  PasswordReset: 'account',
  Address: 'account',
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
} as const

export type TableName = keyof typeof tableSchema

/** Query a table in its own schema (account, catalog, marketing, sales, payment, or ops). */
export function from(table: TableName) {
  return db.schema(tableSchema[table]).from(table)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>

/** Turns a database error into the HTTP error the customer should see. */
export function toHttpError(error: PostgrestError): Error {
  const { code, message, details, hint } = error
  if (code === '23505') return new HttpError(409, 'That value already exists', details)
  if (code === '23503') return new HttpError(409, 'This record is still in use')
  if (code === '22P02' || code === '22023') return new HttpError(400, 'One of the values is not valid')
  if (code === 'PGRST116') return new HttpError(404, 'Record not found')
  if (code === 'P0001') {
    switch (message) {
      case 'SOLD_OUT':
        return new HttpError(409, `${hint ?? 'An item'} just sold out`, { variantId: details })
      case 'COUPON_CLAIMED':
        return new HttpError(400, 'That coupon has been fully claimed')
      case 'NOT_FOUND':
        return new HttpError(404, `${hint ?? 'Record'} not found`)
      case 'BAD_STOCK':
        return new HttpError(400, hint ?? 'Invalid stock change')
      case 'BAD_TRANSITION': {
        const pretty = (value?: string | null) => (value ?? '').replaceAll('_', ' ').toLowerCase()
        return new HttpError(400, `An order that is ${pretty(details)} cannot move to ${pretty(hint)}`)
      }
    }
  }
  return new Error(`Database error: ${message}${details ? ` (${details})` : ''}`)
}

// supabase-js infers result types from the select string, which is too strict for our hand-written shapes,
// so queries are accepted loosely here and typed by the caller.
type Result = { data: unknown; error: PostgrestError | null; count?: number | null }

/** Awaits a query and returns its rows, throwing a mapped error on failure. */
export async function rows<T = Row>(query: PromiseLike<Result>): Promise<T[]> {
  const { data, error } = await query
  if (error) throw toHttpError(error)
  return (data ?? []) as T[]
}

/** Single row (use with .single()): throws 404 when missing. */
export async function one<T = Row>(query: PromiseLike<Result>): Promise<T> {
  const { data, error } = await query
  if (error) throw toHttpError(error)
  return data as T
}

/** Optional row (use with .maybeSingle()). */
export async function maybe<T = Row>(query: PromiseLike<Result>): Promise<T | null> {
  const { data, error } = await query
  if (error) throw toHttpError(error)
  return (data ?? null) as T | null
}

/** Row count from a `{ count: 'exact', head: true }` select. */
export async function count(query: PromiseLike<Result>): Promise<number> {
  const { count: total, error } = await query
  if (error) throw toHttpError(error)
  return total ?? 0
}

/** Write that returns nothing we need. */
export async function exec(query: PromiseLike<{ error: PostgrestError | null }>): Promise<void> {
  const { error } = await query
  if (error) throw toHttpError(error)
}

/** Calls a Postgres function (each runs as one transaction). */
export async function rpc<T = Row>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(name, args)
  if (error) throw toHttpError(error)
  return data as T
}

export const nowIso = () => new Date().toISOString()
