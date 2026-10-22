import { config } from 'dotenv'
import { z } from 'zod'
config({
  path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
})
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(20),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  PASSWORD_PEPPER: z.string().min(32, 'PASSWORD_PEPPER must be at least 32 characters (openssl rand -hex 32)'),
  // 'lax' works when the shop, admin and API share one site (e.g. shop.example.com and api.example.com). Use 'none' only if they are on different sites.
  COOKIE_SAMESITE: z.enum(['lax', 'none']).default('lax'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  PAYMENT_PROVIDER: z.enum(['mock', 'razorpay']).default('mock'),
  PAYMENT_WEBHOOK_SECRET: z.string().default('dev-webhook-secret'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  // Email. RESEND_API_KEY wins; otherwise SMTP_URL; with neither, emails are printed in the API console.
  RESEND_API_KEY: z.string().startsWith('re_', 'RESEND_API_KEY starts with re_').optional(),
  SMTP_URL: z.string().optional(),
  // Where customer replies go. Resend's test sender cannot receive mail, so point this at a real inbox.
  MAIL_REPLY_TO: z.string().email().optional(),
  // Reply-by-email for support. Both are needed to switch it on (see docs in README).
  SUPPORT_INBOUND_EMAIL: z.string().email().optional(),
  SUPPORT_INBOUND_SECRET: z.string().min(16).optional(),
  // Resend's shared test sender works before your domain is verified (it only delivers to your own Resend
  // account email). After verifying theclickmart.com, use e.g. "ClickMart <orders@theclickmart.com>".
  MAIL_FROM: z.string().default('ClickMart <onboarding@resend.dev>'),
  STORE_URL: z.string().default('http://localhost:5173'),
  ADMIN_URL: z.string().default('http://localhost:5175'),
  // Courier aggregator. Both are needed to turn on pincode serviceability checks and shipment booking.
  NIMBUSPOST_API_KEY: z.string().optional(),
  NIMBUSPOST_API_SECRET: z.string().optional(),
  NIMBUSPOST_BASE_URL: z.string().default('https://api-v2.nimbuspost.com/v2'),
})
const cleaned = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ''))
const parsed = schema.safeParse(cleaned)
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}
export const env = parsed.data
export const isProd = env.NODE_ENV === 'production'
if (isProd && env.PAYMENT_PROVIDER === 'razorpay' && (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET)) {
  console.error('PAYMENT_PROVIDER=razorpay requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET')
  process.exit(1)
}
if (isProd && env.PAYMENT_PROVIDER === 'razorpay' && env.PAYMENT_WEBHOOK_SECRET === 'dev-webhook-secret') {
  console.warn('PAYMENT_WEBHOOK_SECRET is not set: Razorpay webhooks will be refused. Set it to the secret of the webhook in the Razorpay dashboard.')
}
if (isProd && env.PAYMENT_PROVIDER === 'razorpay' && env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')) {
  console.warn('RAZORPAY_KEY_ID is a test key: checkout opens Razorpay test mode and no real money moves.')
}
if (isProd && (env.JWT_ACCESS_SECRET.startsWith('dev-') || /localhost|127\.0\.0\.1/.test(env.SUPABASE_URL))) {
  console.error('Refusing to start in production with development secrets or a local database')
  process.exit(1)
}
