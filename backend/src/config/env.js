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
  SMTP_URL: z.string().optional(),
  // Reply-by-email for support. Both are needed to switch it on (see docs in README).
  SUPPORT_INBOUND_EMAIL: z.string().email().optional(),
  SUPPORT_INBOUND_SECRET: z.string().min(16).optional(),
  MAIL_FROM: z.string().default('ClickMart <orders@clickmart.local>'),
  STORE_URL: z.string().default('http://localhost:5173'),
  ADMIN_URL: z.string().default('http://localhost:5175'),
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
if (isProd && (env.JWT_ACCESS_SECRET.startsWith('dev-') || /localhost|127\.0\.0\.1/.test(env.SUPABASE_URL))) {
  console.error('Refusing to start in production with development secrets or a local database')
  process.exit(1)
}
