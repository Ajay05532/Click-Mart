import { config } from 'dotenv'
import { z } from 'zod'

// Tests always use .env.test (a local stack) so they can never write to a real project.
config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' })

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(20),
  // Not used by the API (it only talks to Supabase with the service key). Accepted so it can stay in .env.
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  // Secret key mixed into every password before bcrypt (a "pepper"). Kept out of the database: a leaked
  // database alone cannot be used to crack passwords. NEVER change or lose it, or nobody can log in.
  PASSWORD_PEPPER: z.string().min(32, 'PASSWORD_PEPPER must be at least 32 characters (openssl rand -hex 32)'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  PAYMENT_PROVIDER: z.enum(['mock', 'razorpay']).default('mock'),
  PAYMENT_WEBHOOK_SECRET: z.string().default('dev-webhook-secret'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  // Seed account (npm run db:seed)
  SEED_ADMIN_NAME: z.string().default('Store Admin'),
  SEED_ADMIN_EMAIL: z.string().default('admin@clickmart.com'),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_STAFF_NAME: z.string().default('Store Staff'),
  SEED_STAFF_EMAIL: z.string().default('staff@clickmart.com'),
  SEED_STAFF_PASSWORD: z.string().optional(),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('ClickMart <orders@clickmart.local>'),
  PUBLIC_URL: z.string().default('http://localhost:3000'),
  // Where password-reset links point (customers vs staff).
  STORE_URL: z.string().default('http://localhost:5173'),
  ADMIN_URL: z.string().default('http://localhost:5175'),
})

// Blank values in .env (e.g. "RAZORPAY_KEY_ID=") mean "not set".
const cleaned = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ''))
const parsed = schema.safeParse(cleaned)
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
export const isProd = env.NODE_ENV === 'production'
/** The local Docker stack has no Supabase Storage, so uploads fall back to local disk. */
export const isLocalStack = /localhost|127\.0\.0\.1/.test(env.SUPABASE_URL)

if (isProd && env.PAYMENT_PROVIDER === 'razorpay' && (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET)) {
  console.error('PAYMENT_PROVIDER=razorpay requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET')
  process.exit(1)
}
if (isProd && (env.JWT_ACCESS_SECRET.startsWith('dev-') || isLocalStack)) {
  console.error('Refusing to start in production with development secrets or a local database')
  process.exit(1)
}
