-- ============================================================================
-- ClickMart database (PostgreSQL / Supabase)
--
-- The single source of truth for the database. The API talks to it through
-- Supabase's REST API using SUPABASE_URL + SUPABASE_SERVICE_KEY, so there is no
-- database password or connection string to manage.
--
-- HOW TO RUN (hosted Supabase, the project in backend/.env)
--   1. Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--      Safe to run again. Tables already in public are moved into the schemas
--      below. Products, orders and customers are kept.
--      A later change also has its own file under backend/supabase/migrations/.
--      Paste that smaller file when you only need the new table or column.
--   2. Project Settings -> Data API -> Exposed schemas: add
--      account, catalog, marketing, sales, payment, ops
--      (public can stay). Save. The SQL also tries to set this for you.
--   3. From backend/:  npm run db:seed
--
-- HOW THE STORE IS ORGANISED
--   account    login, customer / staff / admin details, sessions, addresses
--   catalog    brand, category, product, photos, pack size, stock, reviews
--   marketing  coupons, offers, banners
--   sales      cart, wishlist, orders, order lines, tracking, shipments
--   payment    payments (history), refunds, saved UPI/cards, gateway webhook log
--   ops        store settings and the audit log
--
-- SECTIONS
--    1. Enums             2. Users & sessions    3. Catalogue        4. Marketing
--    5. Cart & wishlist   6. Orders & payments   7. Reviews & system 8. Indexes
--    9. Foreign keys     10. Triggers           11. Business functions
--   12. Security (RLS + grants)  13. Report views  14. Starter data  15. Image storage
-- ============================================================================

-- ============================================================================
-- Schemas. Each holds one part of the store. public is left for extensions.
--   account    who can log in (customers, staff, admins) and their addresses
--   catalog    brands, categories, products, pack sizes, stock, reviews
--   marketing  coupons, automatic offers, homepage banners
--   sales      carts, wishlists, orders, shipments
--   payment    every payment attempt, refunds, saved UPI IDs / cards, webhook log
--   ops        store settings and the audit log
-- Existing tables in public are moved here. Rows are kept.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS account;
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS marketing;
CREATE SCHEMA IF NOT EXISTS sales;
CREATE SCHEMA IF NOT EXISTS payment;
CREATE SCHEMA IF NOT EXISTS ops;

DROP VIEW IF EXISTS public.v_low_stock;
DROP VIEW IF EXISTS public.v_daily_sales;
DROP VIEW IF EXISTS public.v_catalogue;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Role','account'),
    ('StockReason','catalog'),
    ('ReviewStatus','catalog'),
    ('DiscountType','marketing'),
    ('BannerPlacement','marketing'),
    ('OrderStatus','sales'),
    ('PaymentStatus','sales'),
    ('PaymentMethod','sales'),
    ('RefundStatus','sales')
  ) AS t(typ, sch)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_type ty
      JOIN pg_namespace n ON n.oid = ty.typnamespace
      WHERE n.nspname = 'public' AND ty.typname = r.typ
    ) THEN
      EXECUTE format('ALTER TYPE public.%I SET SCHEMA %I', r.typ, r.sch);
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
    ('User','account'),
    ('RefreshToken','account'),
    ('PasswordReset','account'),
    ('Address','account'),
    ('Brand','catalog'),
    ('Category','catalog'),
    ('Product','catalog'),
    ('ProductImage','catalog'),
    ('ProductVariant','catalog'),
    ('StockMovement','catalog'),
    ('Review','catalog'),
    ('Coupon','marketing'),
    ('CouponProduct','marketing'),
    ('CouponCategory','marketing'),
    ('CouponRedemption','marketing'),
    ('Offer','marketing'),
    ('OfferProduct','marketing'),
    ('OfferCategory','marketing'),
    ('Banner','marketing'),
    ('CartItem','sales'),
    ('WishlistItem','sales'),
    ('Order','sales'),
    ('OrderItem','sales'),
    ('OrderEvent','sales'),
    ('Shipment','sales'),
    ('Setting','ops'),
    ('AuditLog','ops')
  ) AS t(tbl, sch)
  LOOP
    IF to_regclass(format('public.%I', r.tbl)) IS NOT NULL
       AND to_regclass(format('%I.%I', r.sch, r.tbl)) IS NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA %I', r.tbl, r.sch);
    END IF;
  END LOOP;
END $$;

-- Payment tables used to sit in sales / account. Move them into the payment schema (rows kept).
-- Incremental paste: backend/supabase/migrations/2026-10-12-payment-schema.sql
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Payment','sales'), ('Refund','sales'), ('SavedPayment','account'), ('SavedPayment','public'), ('Payment','public'), ('Refund','public')
  ) AS t(tbl, src)
  LOOP
    IF to_regclass(format('%I.%I', r.src, r.tbl)) IS NOT NULL AND to_regclass(format('payment.%I', r.tbl)) IS NULL THEN
      EXECUTE format('ALTER TABLE %I.%I SET SCHEMA payment', r.src, r.tbl);
    END IF;
  END LOOP;
END $$;

-- public is first so CREATE FUNCTION lands in public. The API calls those
-- functions with rpc(), and PostgREST looks in public before the other schemas.
-- Tables below are schema-qualified, so this order does not put them in public.
SET search_path = public, account, catalog, marketing, sales, payment, ops;

-- ============================================================================
-- 1. Enums
-- Fixed value lists used by the tables below.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE account."Role" AS ENUM ('CUSTOMER', 'STAFF', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE marketing."DiscountType" AS ENUM ('PERCENT', 'FLAT', 'FREE_SHIPPING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sales."OrderStatus" AS ENUM ('PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sales."PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sales."PaymentMethod" AS ENUM ('UPI', 'CARD', 'NETBANKING', 'COD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE catalog."StockReason" AS ENUM ('SALE', 'RESTOCK', 'ADJUSTMENT', 'RETURN', 'CANCELLATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE catalog."ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE marketing."BannerPlacement" AS ENUM ('HERO', 'PROMO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sales."RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. Login and profiles
-- Login is the only place a password is stored. role says who they are:
--   CUSTOMER  a shopper (details in Customer)
--   STAFF     manages products, stock, orders, offers, banners, reviews (details in Staff)
--   ADMIN     everything staff can do, plus coupons, refunds, settings, team (details in Admin)
-- An old combined User row is renamed to Login, then name and phone move into the matching profile.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('account."Login"') IS NULL AND to_regclass('account."User"') IS NOT NULL THEN
    ALTER TABLE account."User" RENAME TO "Login";
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS account."Login" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Login_pkey" PRIMARY KEY ("id")
);

-- Shopper details. One row per buyer. Addresses stay on userId, which is this login id.
CREATE TABLE IF NOT EXISTS account."Customer" (
    "loginId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("loginId"),
    CONSTRAINT "Customer_loginId_fkey" FOREIGN KEY ("loginId") REFERENCES account."Login"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Staff who manage the shop day to day.
CREATE TABLE IF NOT EXISTS account."Staff" (
    "loginId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("loginId"),
    CONSTRAINT "Staff_loginId_fkey" FOREIGN KEY ("loginId") REFERENCES account."Login"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Store owners. Same kind of details as staff; the Login role is what grants full access.
CREATE TABLE IF NOT EXISTS account."Admin" (
    "loginId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("loginId"),
    CONSTRAINT "Admin_loginId_fkey" FOREIGN KEY ("loginId") REFERENCES account."Login"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Move name and phone off a login row that still has them (the old User shape).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'account' AND table_name = 'Login' AND column_name = 'name'
  ) THEN
    INSERT INTO account."Customer" ("loginId", "name", "phone", "createdAt", "updatedAt")
    SELECT "id", "name", "phone", "createdAt", "updatedAt" FROM account."Login" WHERE "role" = 'CUSTOMER'
    ON CONFLICT ("loginId") DO NOTHING;
    INSERT INTO account."Staff" ("loginId", "name", "phone", "createdAt", "updatedAt")
    SELECT "id", "name", "phone", "createdAt", "updatedAt" FROM account."Login" WHERE "role" = 'STAFF'
    ON CONFLICT ("loginId") DO NOTHING;
    INSERT INTO account."Admin" ("loginId", "name", "phone", "createdAt", "updatedAt")
    SELECT "id", "name", "phone", "createdAt", "updatedAt" FROM account."Login" WHERE "role" = 'ADMIN'
    ON CONFLICT ("loginId") DO NOTHING;
    ALTER TABLE account."Login" DROP COLUMN "name";
    ALTER TABLE account."Login" DROP COLUMN "phone";
  END IF;
END $$;

ALTER TABLE account."Customer" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE account."Staff" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE account."Admin" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;

-- RefreshToken
CREATE TABLE IF NOT EXISTS account."RefreshToken" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- PasswordReset
CREATE TABLE IF NOT EXISTS account."PasswordReset" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordReset_tokenHash_key" ON account."PasswordReset"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordReset_userId_idx" ON account."PasswordReset"("userId");
DO $$ BEGIN ALTER TABLE account."PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES account."Login"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Address
CREATE TABLE IF NOT EXISTS account."Address" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "landmark" TEXT,
    "label" TEXT NOT NULL DEFAULT 'HOME',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- DeliveryLocation: the spot a signed-in customer picked in the header "Set PIN" map.
-- One row per login. Guests keep theirs in the browser only.
-- Incremental paste: backend/supabase/migrations/2026-10-12-delivery-location.sql
CREATE TABLE IF NOT EXISTS account."DeliveryLocation" (
    "userId" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "area" TEXT,
    "label" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryLocation_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "DeliveryLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES account."Login"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryLocation_pin_check" CHECK ("pin" ~ '^[0-9]{6}$'),
    CONSTRAINT "DeliveryLocation_lat_check" CHECK ("lat" IS NULL OR "lat" BETWEEN -90 AND 90),
    CONSTRAINT "DeliveryLocation_lng_check" CHECK ("lng" IS NULL OR "lng" BETWEEN -180 AND 180)
);

-- SavedPayment: UPI IDs and cards a customer chose to keep for next time.
-- Never holds a full card number or CVV: only brand, last 4 digits, expiry and
-- name. "gatewayToken" is the gateway's own reference (Razorpay token id) if one exists.
CREATE TABLE IF NOT EXISTS payment."SavedPayment" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "upiId" TEXT,
    "cardBrand" TEXT,
    "last4" TEXT,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "holderName" TEXT,
    "nickname" TEXT,
    "gatewayToken" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedPayment_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- 3. Catalogue
-- Brand, then a category tree, then the product and its sellable pack sizes.
-- ProductVariant is the SKU: it owns price, MRP and stock. ProductImage owns photos.
-- StockMovement is the audit trail for every stock change.
-- ============================================================================

-- Brand
CREATE TABLE IF NOT EXISTS catalog."Brand" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- Category
CREATE TABLE IF NOT EXISTS catalog."Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL DEFAULT '',
    "image" TEXT,
    "art" TEXT NOT NULL DEFAULT 'mix',
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- Product
CREATE TABLE IF NOT EXISTS catalog."Product" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subcategoryId" TEXT,
    "blurb" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "highlights" TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    "nutrition" JSONB NOT NULL DEFAULT '[]',
    "images" TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    "art" TEXT NOT NULL DEFAULT 'mix',
    "brandId" TEXT,
    "hsnCode" TEXT,
    "gstPercent" INTEGER NOT NULL DEFAULT 5,
    "countryOfOrigin" TEXT NOT NULL DEFAULT 'India',
    "ingredients" TEXT NOT NULL DEFAULT '',
    "shelfLifeDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBestseller" BOOLEAN NOT NULL DEFAULT false,
    "featuredSize" TEXT,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- ProductImage: ordered photos. "Product"."images" is kept in sync by set_product_images.
CREATE TABLE IF NOT EXISTS catalog."ProductImage" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- ProductVariant
CREATE TABLE IF NOT EXISTS catalog."ProductVariant" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "productId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "weightGrams" INTEGER,
    "price" INTEGER NOT NULL,
    "mrp" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "lowStockAt" INTEGER NOT NULL DEFAULT 10,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- StockMovement
CREATE TABLE IF NOT EXISTS catalog."StockMovement" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "variantId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "StockReason" NOT NULL,
    "note" TEXT,
    "orderId" TEXT,
    "userId" TEXT,
    "balance" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- 4. Marketing
-- Checkout coupons, automatic offers (sale prices) and homepage banners.
-- ============================================================================

-- Coupon
CREATE TABLE IF NOT EXISTS marketing."Coupon" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "minOrder" INTEGER NOT NULL DEFAULT 0,
    "maxDiscount" INTEGER,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "usageLimit" INTEGER,
    "perUserLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "categoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    "productIds" TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- Which products and categories a coupon applies to. Empty means the whole catalogue.
CREATE TABLE IF NOT EXISTS marketing."CouponProduct" (
    "couponId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "CouponProduct_pkey" PRIMARY KEY ("couponId", "productId")
);

CREATE TABLE IF NOT EXISTS marketing."CouponCategory" (
    "couponId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "CouponCategory_pkey" PRIMARY KEY ("couponId", "categoryId")
);

-- CouponRedemption
CREATE TABLE IF NOT EXISTS marketing."CouponRedemption" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "couponId" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- Offer
CREATE TABLE IF NOT EXISTS marketing."Offer" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "badge" TEXT,
    "type" "DiscountType" NOT NULL DEFAULT 'PERCENT',
    "value" INTEGER NOT NULL,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "categoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    "productIds" TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- Which products and categories an automatic offer applies to. Empty means the whole catalogue.
CREATE TABLE IF NOT EXISTS marketing."OfferProduct" (
    "offerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "OfferProduct_pkey" PRIMARY KEY ("offerId", "productId")
);

CREATE TABLE IF NOT EXISTS marketing."OfferCategory" (
    "offerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "OfferCategory_pkey" PRIMARY KEY ("offerId", "categoryId")
);

-- Banner
CREATE TABLE IF NOT EXISTS marketing."Banner" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "image" TEXT,
    "link" TEXT NOT NULL DEFAULT '/shop',
    "placement" "BannerPlacement" NOT NULL DEFAULT 'HERO',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- 5. Cart & wishlist
-- Saved carts and wishlists for logged-in customers.
-- ============================================================================

-- CartItem
CREATE TABLE IF NOT EXISTS sales."CartItem" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- WishlistItem
CREATE TABLE IF NOT EXISTS sales."WishlistItem" (
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("userId","productId")
);

-- ============================================================================
-- 6. Orders & payments
-- Order lines snapshot name, size and price. OrderEvent is the tracking timeline.
-- ============================================================================

-- Order
CREATE TABLE IF NOT EXISTS sales."Order" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "number" SERIAL NOT NULL,
    "userId" TEXT,
    "customerName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "offerDiscount" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "shipping" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "couponCode" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PLACED',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- OrderItem
CREATE TABLE IF NOT EXISTS sales."OrderItem" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "image" TEXT,
    "art" TEXT,
    "size" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "mrp" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "hsnCode" TEXT,
    "gstPercent" INTEGER,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- OrderEvent
CREATE TABLE IF NOT EXISTS sales."OrderEvent" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- Payment
CREATE TABLE IF NOT EXISTS payment."Payment" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "method" "PaymentMethod" NOT NULL,
    "raw" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- Shipment: one courier consignment per order.
CREATE TABLE IF NOT EXISTS sales."Shipment" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "orderId" TEXT NOT NULL,
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "shippedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- Refund: money sent back against a payment.
CREATE TABLE IF NOT EXISTS payment."Refund" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- WebhookEvent: every signed notification the gateway (Razorpay) sends us. "eventId" makes
-- redelivered events harmless (unique per provider). "payload" keeps the raw body for support.
CREATE TABLE IF NOT EXISTS payment."WebhookEvent" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "payload" JSONB,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- 7. Reviews & system
-- Moderated reviews, store settings (key/value) and an audit log of admin actions.
-- ============================================================================

-- Review
CREATE TABLE IF NOT EXISTS catalog."Review" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "productId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'India',
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "images" TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- Setting
CREATE TABLE IF NOT EXISTS ops."Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- AuditLog
CREATE TABLE IF NOT EXISTS ops."AuditLog" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "diff" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);


-- ============================================================================
-- Columns and tables for a project that already has the shop.
-- CREATE TABLE above is skipped when the table exists, so these ALTERs add the
-- new columns onto Login, Address, Product, ProductVariant and OrderItem.
-- New tables (Brand, ProductImage, Shipment, Refund, PasswordReset, ...) are
-- created above when they are missing. Your products, orders and customers stay.
-- ============================================================================

DROP TABLE IF EXISTS "_OfferToProduct";
DROP TABLE IF EXISTS "_prisma_migrations";

ALTER TABLE account."Login" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMPTZ(3);

ALTER TABLE sales."Order" ADD COLUMN IF NOT EXISTS "paymentDetail" TEXT;
ALTER TABLE account."Address" ADD COLUMN IF NOT EXISTS "landmark" TEXT;
ALTER TABLE account."Address" ADD COLUMN IF NOT EXISTS "label" TEXT NOT NULL DEFAULT 'HOME';

-- What the customer paid with, shown in payment history (no card numbers).
ALTER TABLE payment."Payment" ADD COLUMN IF NOT EXISTS "detail" TEXT;
ALTER TABLE payment."Payment" ADD COLUMN IF NOT EXISTS "upiId" TEXT;
ALTER TABLE payment."Payment" ADD COLUMN IF NOT EXISTS "cardBrand" TEXT;
ALTER TABLE payment."Payment" ADD COLUMN IF NOT EXISTS "cardLast4" TEXT;
ALTER TABLE payment."Payment" ADD COLUMN IF NOT EXISTS "bank" TEXT;
ALTER TABLE payment."Payment" ADD COLUMN IF NOT EXISTS "savedPaymentId" TEXT;
ALTER TABLE payment."Payment" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
ALTER TABLE payment."Payment" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMPTZ(3);

ALTER TABLE catalog."Product" ADD COLUMN IF NOT EXISTS "brandId" TEXT;
ALTER TABLE catalog."Product" ADD COLUMN IF NOT EXISTS "hsnCode" TEXT;
ALTER TABLE catalog."Product" ADD COLUMN IF NOT EXISTS "gstPercent" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE catalog."Product" ADD COLUMN IF NOT EXISTS "countryOfOrigin" TEXT NOT NULL DEFAULT 'India';
ALTER TABLE catalog."Product" ADD COLUMN IF NOT EXISTS "ingredients" TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog."Product" ADD COLUMN IF NOT EXISTS "shelfLifeDays" INTEGER;

ALTER TABLE catalog."ProductVariant" ADD COLUMN IF NOT EXISTS "barcode" TEXT;
ALTER TABLE catalog."ProductVariant" ADD COLUMN IF NOT EXISTS "weightGrams" INTEGER;

ALTER TABLE sales."OrderItem" ADD COLUMN IF NOT EXISTS "hsnCode" TEXT;
ALTER TABLE sales."OrderItem" ADD COLUMN IF NOT EXISTS "gstPercent" INTEGER;
ALTER TABLE catalog."Review" ADD COLUMN IF NOT EXISTS "images" TEXT[] NOT NULL DEFAULT ARRAY[]::text[];

-- List columns must be empty arrays, never NULL.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('catalog','Product','highlights'),('catalog','Product','images'),
    ('marketing','Coupon','categoryIds'),('marketing','Coupon','productIds'),
    ('marketing','Offer','categoryIds'),('marketing','Offer','productIds')
  ) AS t(sch, tbl, col)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = r.sch AND table_name = r.tbl AND column_name = r.col
    ) THEN
      EXECUTE format('UPDATE %I.%I SET %I = ARRAY[]::text[] WHERE %I IS NULL', r.sch, r.tbl, r.col, r.col);
      EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT ARRAY[]::text[]', r.sch, r.tbl, r.col);
      EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET NOT NULL', r.sch, r.tbl, r.col);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 8. Indexes
-- Unique constraints and lookup indexes.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('account."User_email_key"') IS NOT NULL AND to_regclass('account."Login_email_key"') IS NULL THEN
    ALTER INDEX account."User_email_key" RENAME TO "Login_email_key";
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "Login_email_key" ON account."Login"("email");

CREATE UNIQUE INDEX IF NOT EXISTS "Brand_slug_key" ON catalog."Brand"("slug");

CREATE UNIQUE INDEX IF NOT EXISTS "Brand_name_key" ON catalog."Brand"("name");

CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON account."RefreshToken"("tokenHash");

CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON account."RefreshToken"("userId");

CREATE INDEX IF NOT EXISTS "Address_userId_idx" ON account."Address"("userId");
CREATE INDEX IF NOT EXISTS "SavedPayment_userId_idx" ON payment."SavedPayment"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "SavedPayment_upi_key" ON payment."SavedPayment"("userId", lower("upiId")) WHERE "kind" = 'UPI';
CREATE UNIQUE INDEX IF NOT EXISTS "SavedPayment_card_key" ON payment."SavedPayment"("userId", "cardBrand", "last4", "expMonth", "expYear") WHERE "kind" = 'CARD';

CREATE INDEX IF NOT EXISTS "Category_parentId_idx" ON catalog."Category"("parentId");

CREATE UNIQUE INDEX IF NOT EXISTS "Product_slug_key" ON catalog."Product"("slug");

CREATE INDEX IF NOT EXISTS "Product_categoryId_idx" ON catalog."Product"("categoryId");

CREATE INDEX IF NOT EXISTS "Product_isActive_idx" ON catalog."Product"("isActive");

CREATE INDEX IF NOT EXISTS "Product_brandId_idx" ON catalog."Product"("brandId");

CREATE UNIQUE INDEX IF NOT EXISTS "ProductImage_productId_sortOrder_key" ON catalog."ProductImage"("productId", "sortOrder");

CREATE INDEX IF NOT EXISTS "ProductImage_productId_idx" ON catalog."ProductImage"("productId");

CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_barcode_key" ON catalog."ProductVariant"("barcode") WHERE "barcode" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_sku_key" ON catalog."ProductVariant"("sku");

CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_productId_size_key" ON catalog."ProductVariant"("productId", "size");

CREATE INDEX IF NOT EXISTS "StockMovement_variantId_createdAt_idx" ON catalog."StockMovement"("variantId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_code_key" ON marketing."Coupon"("code");

CREATE INDEX IF NOT EXISTS "CouponRedemption_couponId_userId_idx" ON marketing."CouponRedemption"("couponId", "userId");

CREATE UNIQUE INDEX IF NOT EXISTS "CartItem_userId_variantId_key" ON sales."CartItem"("userId", "variantId");

CREATE UNIQUE INDEX IF NOT EXISTS "Order_number_key" ON sales."Order"("number");

CREATE INDEX IF NOT EXISTS "Order_userId_idx" ON sales."Order"("userId");

CREATE INDEX IF NOT EXISTS "Order_status_idx" ON sales."Order"("status");

CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON sales."Order"("createdAt");

CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON sales."OrderItem"("orderId");

CREATE INDEX IF NOT EXISTS "OrderEvent_orderId_createdAt_idx" ON sales."OrderEvent"("orderId", "createdAt");

CREATE INDEX IF NOT EXISTS "Payment_orderId_idx" ON payment."Payment"("orderId");

CREATE INDEX IF NOT EXISTS "Payment_providerOrderId_idx" ON payment."Payment"("providerOrderId");

CREATE UNIQUE INDEX IF NOT EXISTS "Shipment_orderId_key" ON sales."Shipment"("orderId");

CREATE UNIQUE INDEX IF NOT EXISTS "WebhookEvent_provider_eventId_key" ON payment."WebhookEvent"("provider", "eventId");
CREATE INDEX IF NOT EXISTS "WebhookEvent_receivedAt_idx" ON payment."WebhookEvent"("receivedAt" DESC);
DO $$ BEGIN ALTER TABLE payment."WebhookEvent" ADD CONSTRAINT "WebhookEvent_status_check" CHECK ("status" IN ('RECEIVED','PROCESSED','IGNORED','FAILED')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Refund_orderId_idx" ON payment."Refund"("orderId");

CREATE INDEX IF NOT EXISTS "Review_productId_status_idx" ON catalog."Review"("productId", "status");

CREATE INDEX IF NOT EXISTS "AuditLog_entity_entityId_idx" ON ops."AuditLog"("entity", "entityId");

CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON ops."AuditLog"("createdAt");

DO $$ BEGIN ALTER TABLE account."Address" ADD CONSTRAINT "Address_label_check" CHECK ("label" IN ('HOME', 'WORK', 'OTHER')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE catalog."Product" ADD CONSTRAINT "Product_gst_check" CHECK ("gstPercent" BETWEEN 0 AND 28); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE catalog."Product" ADD CONSTRAINT "Product_shelf_life_check" CHECK ("shelfLifeDays" IS NULL OR "shelfLifeDays" > 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE catalog."ProductVariant" ADD CONSTRAINT "ProductVariant_money_stock_check" CHECK ("price" >= 1 AND "mrp" >= "price" AND "stock" >= 0 AND "lowStockAt" >= 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE catalog."ProductVariant" ADD CONSTRAINT "ProductVariant_weight_check" CHECK ("weightGrams" IS NULL OR "weightGrams" > 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE sales."CartItem" ADD CONSTRAINT "CartItem_quantity_check" CHECK ("quantity" > 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE sales."OrderItem" ADD CONSTRAINT "OrderItem_quantity_check" CHECK ("quantity" > 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE sales."OrderItem" ADD CONSTRAINT "OrderItem_money_check" CHECK ("unitPrice" >= 0 AND "mrp" >= 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE catalog."Review" ADD CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payment."Refund" ADD CONSTRAINT "Refund_amount_check" CHECK ("amount" > 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE sales."Order" ADD CONSTRAINT "Order_money_check" CHECK ("subtotal" >= 0 AND "discount" >= 0 AND "shipping" >= 0 AND "total" >= 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 9. Foreign keys
-- Relations between tables (added last so table order never matters).
-- ============================================================================

DO $$ BEGIN ALTER TABLE account."RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES account."Login"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE account."Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES account."Login"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payment."SavedPayment" ADD CONSTRAINT "SavedPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES account."Login"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payment."SavedPayment" ADD CONSTRAINT "SavedPayment_kind_check" CHECK ("kind" IN ('UPI', 'CARD') AND (("kind" = 'UPI' AND "upiId" IS NOT NULL) OR ("kind" = 'CARD' AND "last4" IS NOT NULL AND "expMonth" BETWEEN 1 AND 12))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE catalog."Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES catalog."Category"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE catalog."Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES catalog."Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE catalog."ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES catalog."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE catalog."Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES catalog."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE catalog."Product" ADD CONSTRAINT "Product_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES catalog."Category"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE catalog."ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES catalog."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE catalog."StockMovement" ADD CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES catalog."ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE catalog."StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES account."Login"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE marketing."CouponProduct" ADD CONSTRAINT "CouponProduct_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES marketing."Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE marketing."CouponProduct" ADD CONSTRAINT "CouponProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES catalog."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE marketing."CouponCategory" ADD CONSTRAINT "CouponCategory_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES marketing."Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE marketing."CouponCategory" ADD CONSTRAINT "CouponCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES catalog."Category"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE marketing."OfferProduct" ADD CONSTRAINT "OfferProduct_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES marketing."Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE marketing."OfferProduct" ADD CONSTRAINT "OfferProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES catalog."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE marketing."OfferCategory" ADD CONSTRAINT "OfferCategory_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES marketing."Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE marketing."OfferCategory" ADD CONSTRAINT "OfferCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES catalog."Category"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE marketing."CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES marketing."Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE marketing."CouponRedemption" ADD CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES account."Login"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE sales."CartItem" ADD CONSTRAINT "CartItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES account."Login"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE sales."CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES catalog."ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE sales."WishlistItem" ADD CONSTRAINT "WishlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES account."Login"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE sales."WishlistItem" ADD CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES catalog."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE sales."Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES account."Login"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE sales."OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES sales."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE sales."OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES catalog."ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE sales."OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES sales."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE payment."Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES sales."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE sales."Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES sales."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE payment."Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES sales."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payment."Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES payment."Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payment."Refund" ADD CONSTRAINT "Refund_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES account."Login"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE catalog."Review" ADD CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES catalog."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE catalog."Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES account."Login"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE ops."AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES account."Login"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 10. Triggers
-- Keeps "updatedAt" fresh on every update.
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "User_updated_at" ON account."Login";
DROP TRIGGER IF EXISTS "Login_updated_at" ON account."Login";
CREATE TRIGGER "Login_updated_at" BEFORE UPDATE ON account."Login" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS "Customer_updated_at" ON account."Customer";
CREATE TRIGGER "Customer_updated_at" BEFORE UPDATE ON account."Customer" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS "Staff_updated_at" ON account."Staff";
CREATE TRIGGER "Staff_updated_at" BEFORE UPDATE ON account."Staff" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS "Admin_updated_at" ON account."Admin";
CREATE TRIGGER "Admin_updated_at" BEFORE UPDATE ON account."Admin" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS "Product_updated_at" ON catalog."Product";
CREATE TRIGGER "Product_updated_at" BEFORE UPDATE ON catalog."Product" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS "Order_updated_at" ON sales."Order";
CREATE TRIGGER "Order_updated_at" BEFORE UPDATE ON sales."Order" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS "Setting_updated_at" ON ops."Setting";
CREATE TRIGGER "Setting_updated_at" BEFORE UPDATE ON ops."Setting" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS "Shipment_updated_at" ON sales."Shipment";
CREATE TRIGGER "Shipment_updated_at" BEFORE UPDATE ON sales."Shipment" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 11. Business functions
--     Multi-step operations that must be all-or-nothing (placing an order,
--     changing stock, confirming a payment). The API calls these through
--     Supabase's REST "rpc" endpoint. Postgres runs each one as a single
--     transaction, so two shoppers can never buy the last pouch.
--     Only the service_role key can call them (see section 12).
-- ============================================================================

-- Raised errors carry a short tag the API turns into a friendly message:
--   SOLD_OUT | COUPON_CLAIMED | BAD_TRANSITION | NOT_FOUND | BAD_STOCK

-- Put the items of an order back on the shelf and log it.
CREATE OR REPLACE FUNCTION restore_stock(p_order_id TEXT, p_reason "StockReason", p_note TEXT)
RETURNS void LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
DECLARE
  item RECORD;
  new_stock INT;
BEGIN
  FOR item IN SELECT * FROM sales."OrderItem" WHERE "orderId" = p_order_id AND "variantId" IS NOT NULL ORDER BY "variantId" LOOP
    UPDATE catalog."ProductVariant" SET "stock" = "stock" + item."quantity"
      WHERE "id" = item."variantId" RETURNING "stock" INTO new_stock;
    INSERT INTO catalog."StockMovement" ("variantId", "delta", "reason", "note", "orderId", "balance")
      VALUES (item."variantId", item."quantity", p_reason, p_note, p_order_id, new_stock);
    IF item."productId" IS NOT NULL THEN
      UPDATE catalog."Product" SET "sold" = GREATEST(0, "sold" - item."quantity") WHERE "id" = item."productId";
    END IF;
  END LOOP;
END $$;

-- Place an order. The API prices the cart; this function reserves stock, claims
-- the coupon, and writes the order, its items and its first timeline events.
-- p = { userId, customer{name,email,phone}, address{line,city,state,pin}, paymentMethod,
--       couponCode, subtotal, offerDiscount, discount, shipping, total,
--       lines[{variantId,productId,name,slug,image,art,size,unitPrice,mrp,quantity}] }
CREATE OR REPLACE FUNCTION create_order(p JSONB)
RETURNS JSONB LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
DECLARE
  line JSONB;
  v_id TEXT := 'ord_' || replace(gen_random_uuid()::text, '-', '');
  v_cod BOOLEAN := (p->>'paymentMethod') = 'COD';
  v_user TEXT := NULLIF(p->>'userId', '');
  v_stock INT;
  v_coupon marketing."Coupon"%ROWTYPE;
  v_number INT;
BEGIN
  -- Lock variants in a fixed order so concurrent checkouts cannot deadlock.
  FOR line IN SELECT value FROM jsonb_array_elements(p->'lines') ORDER BY value->>'variantId' LOOP
    UPDATE catalog."ProductVariant" SET "stock" = "stock" - (line->>'quantity')::int
      WHERE "id" = line->>'variantId' AND "isActive" AND "stock" >= (line->>'quantity')::int
      RETURNING "stock" INTO v_stock;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOLD_OUT' USING DETAIL = line->>'variantId', HINT = (line->>'name') || ' (' || (line->>'size') || ')';
    END IF;
    INSERT INTO catalog."StockMovement" ("variantId", "delta", "reason", "balance", "userId")
      VALUES (line->>'variantId', -(line->>'quantity')::int, 'SALE', v_stock, v_user);
    UPDATE catalog."Product" SET "sold" = "sold" + (line->>'quantity')::int WHERE "id" = line->>'productId';
  END LOOP;

  IF NULLIF(p->>'couponCode', '') IS NOT NULL THEN
    SELECT * INTO v_coupon FROM marketing."Coupon" WHERE "code" = p->>'couponCode' FOR UPDATE;
    IF NOT FOUND OR (v_coupon."usageLimit" IS NOT NULL AND v_coupon."usedCount" >= v_coupon."usageLimit") THEN
      RAISE EXCEPTION 'COUPON_CLAIMED';
    END IF;
    UPDATE marketing."Coupon" SET "usedCount" = "usedCount" + 1 WHERE "id" = v_coupon."id";
  END IF;

  INSERT INTO sales."Order" ("id", "userId", "customerName", "email", "phone", "addressLine", "city", "state", "pin",
                       "subtotal", "offerDiscount", "discount", "shipping", "total", "couponCode",
                       "status", "paymentStatus", "paymentMethod")
  VALUES (v_id, v_user, p->'customer'->>'name', lower(p->'customer'->>'email'), p->'customer'->>'phone',
          p->'address'->>'line', p->'address'->>'city', p->'address'->>'state', p->'address'->>'pin',
          (p->>'subtotal')::int, (p->>'offerDiscount')::int, (p->>'discount')::int, (p->>'shipping')::int,
          (p->>'total')::int, NULLIF(p->>'couponCode', ''),
          CASE WHEN v_cod THEN 'CONFIRMED' ELSE 'PLACED' END::"OrderStatus", 'PENDING', (p->>'paymentMethod')::"PaymentMethod")
  RETURNING "number" INTO v_number;

  INSERT INTO sales."OrderItem" ("orderId", "variantId", "productId", "name", "slug", "image", "art", "size", "unitPrice", "mrp", "quantity", "hsnCode", "gstPercent")
  SELECT v_id, l->>'variantId', l->>'productId', l->>'name', l->>'slug', l->>'image', l->>'art', l->>'size',
         (l->>'unitPrice')::int, (l->>'mrp')::int, (l->>'quantity')::int,
         NULLIF(l->>'hsnCode', ''), NULLIF(l->>'gstPercent', '')::int
  FROM jsonb_array_elements(p->'lines') AS l;

  INSERT INTO sales."OrderEvent" ("orderId", "status", "note") VALUES (v_id, 'PLACED', CASE WHEN v_cod THEN 'Order placed' ELSE 'Order placed. Waiting for payment.' END);
  IF v_cod THEN
    INSERT INTO sales."OrderEvent" ("orderId", "status", "note") VALUES (v_id, 'CONFIRMED', 'Confirmed. Pay on delivery.');
  END IF;

  IF v_coupon."id" IS NOT NULL THEN
    INSERT INTO marketing."CouponRedemption" ("couponId", "userId", "orderId") VALUES (v_coupon."id", v_user, v_id);
  END IF;
  IF v_user IS NOT NULL THEN
    DELETE FROM sales."CartItem" WHERE "userId" = v_user;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'number', v_number);
END $$;

-- Online payment confirmed (idempotent: webhooks and the browser callback may both arrive).
CREATE OR REPLACE FUNCTION mark_paid(p_provider_order_id TEXT, p_payment_id TEXT, p_raw JSONB DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
DECLARE
  pay payment."Payment"%ROWTYPE;
  ord sales."Order"%ROWTYPE;
BEGIN
  SELECT * INTO pay FROM payment."Payment" WHERE "providerOrderId" = p_provider_order_id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING HINT = 'Payment'; END IF;
  SELECT * INTO ord FROM sales."Order" WHERE "id" = pay."orderId" FOR UPDATE;
  IF ord."paymentStatus" = 'PAID' THEN
    RETURN jsonb_build_object('orderId', ord."id", 'changed', false);
  END IF;
  UPDATE payment."Payment" SET "status" = 'PAID', "providerPaymentId" = p_payment_id, "raw" = p_raw, "paidAt" = now() WHERE "id" = pay."id";
  IF ord."status" = 'CANCELLED' THEN
    -- Money arrived after the order was cancelled: flag it for a refund instead of reviving the order.
    UPDATE sales."Order" SET "paymentStatus" = 'PAID' WHERE "id" = ord."id";
    RETURN jsonb_build_object('orderId', ord."id", 'changed', false, 'needsRefund', true);
  END IF;
  UPDATE sales."Order" SET "paymentStatus" = 'PAID', "status" = 'CONFIRMED' WHERE "id" = ord."id";
  INSERT INTO sales."OrderEvent" ("orderId", "status", "note") VALUES (ord."id", 'CONFIRMED', 'Payment received. Order confirmed.');
  RETURN jsonb_build_object('orderId', ord."id", 'changed', true);
END $$;

-- Payment failed or never completed: cancel the order and release its stock.
CREATE OR REPLACE FUNCTION fail_payment(p_order_id TEXT, p_note TEXT DEFAULT 'Payment failed')
RETURNS void LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
DECLARE ord sales."Order"%ROWTYPE;
BEGIN
  SELECT * INTO ord FROM sales."Order" WHERE "id" = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING HINT = 'Order'; END IF;
  IF ord."paymentStatus" = 'PAID' OR ord."status" = 'CANCELLED' THEN RETURN; END IF;
  UPDATE payment."Payment" SET "status" = 'FAILED', "failureReason" = p_note WHERE "orderId" = p_order_id AND "status" = 'PENDING';
  PERFORM restore_stock(p_order_id, 'CANCELLATION', p_note);
  INSERT INTO sales."OrderEvent" ("orderId", "status", "note") VALUES (p_order_id, 'CANCELLED', p_note);
  UPDATE sales."Order" SET "status" = 'CANCELLED', "paymentStatus" = 'FAILED' WHERE "id" = p_order_id;
END $$;

-- Move an order to a new status, enforcing the allowed transitions.
CREATE OR REPLACE FUNCTION change_order_status(p_order_id TEXT, p_to "OrderStatus", p_note TEXT,
                                               p_carrier TEXT DEFAULT NULL, p_tracking TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
DECLARE
  ord sales."Order"%ROWTYPE;
  flow TEXT[] := ARRAY['PLACED','CONFIRMED','PACKED','SHIPPED','OUT_FOR_DELIVERY','DELIVERED'];
  ok BOOLEAN;
BEGIN
  SELECT * INTO ord FROM sales."Order" WHERE "id" = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING HINT = 'Order'; END IF;
  ok := CASE
    WHEN p_to = 'CANCELLED' THEN ord."status"::text = ANY (ARRAY['PLACED','CONFIRMED','PACKED'])
    WHEN p_to = 'RETURNED'  THEN ord."status"::text = ANY (ARRAY['SHIPPED','OUT_FOR_DELIVERY','DELIVERED'])
    ELSE array_position(flow, p_to::text) IS NOT NULL AND array_position(flow, ord."status"::text) IS NOT NULL
         AND array_position(flow, p_to::text) > array_position(flow, ord."status"::text)
  END;
  IF NOT ok THEN
    RAISE EXCEPTION 'BAD_TRANSITION' USING DETAIL = ord."status"::text, HINT = p_to::text;
  END IF;
  IF p_to = 'CANCELLED' THEN PERFORM restore_stock(p_order_id, 'CANCELLATION', p_note); END IF;
  IF p_to = 'RETURNED'  THEN PERFORM restore_stock(p_order_id, 'RETURN', p_note); END IF;
  INSERT INTO sales."OrderEvent" ("orderId", "status", "note") VALUES (p_order_id, p_to, p_note);
  UPDATE sales."Order" SET
    "status" = p_to,
    "carrier" = COALESCE(p_carrier, "carrier"),
    "trackingNumber" = COALESCE(p_tracking, "trackingNumber"),
    -- Cash is collected at the door, so delivery is when COD becomes paid.
    "paymentStatus" = CASE WHEN p_to = 'DELIVERED' AND ord."paymentMethod" = 'COD' THEN 'PAID'::"PaymentStatus" ELSE "paymentStatus" END
  WHERE "id" = p_order_id;
  IF p_to = 'DELIVERED' AND ord."paymentMethod" = 'COD' THEN
    UPDATE payment."Payment" SET "status" = 'PAID' WHERE "orderId" = p_order_id AND "provider" = 'cod';
  END IF;
  IF p_to IN ('SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED') OR p_carrier IS NOT NULL OR p_tracking IS NOT NULL THEN
    INSERT INTO sales."Shipment" ("orderId", "carrier", "trackingNumber", "shippedAt", "deliveredAt")
    VALUES (
      p_order_id,
      COALESCE(p_carrier, ord."carrier"),
      COALESCE(p_tracking, ord."trackingNumber"),
      CASE WHEN p_to IN ('SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED') THEN CURRENT_TIMESTAMP ELSE NULL END,
      CASE WHEN p_to = 'DELIVERED' THEN CURRENT_TIMESTAMP ELSE NULL END
    )
    ON CONFLICT ("orderId") DO UPDATE SET
      "carrier" = COALESCE(EXCLUDED."carrier", "Shipment"."carrier"),
      "trackingNumber" = COALESCE(EXCLUDED."trackingNumber", "Shipment"."trackingNumber"),
      "shippedAt" = COALESCE("Shipment"."shippedAt", EXCLUDED."shippedAt"),
      "deliveredAt" = CASE WHEN p_to = 'DELIVERED' THEN CURRENT_TIMESTAMP ELSE "Shipment"."deliveredAt" END;
  END IF;
  RETURN jsonb_build_object('orderId', p_order_id, 'from', ord."status", 'paymentMethod', ord."paymentMethod", 'paymentStatus', ord."paymentStatus");
END $$;

-- Record that a refund was issued for an order.
CREATE OR REPLACE FUNCTION finish_refund(p_order_id TEXT)
RETURNS void LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
DECLARE ord sales."Order"%ROWTYPE;
BEGIN
  SELECT * INTO ord FROM sales."Order" WHERE "id" = p_order_id FOR UPDATE;
  INSERT INTO payment."Refund" ("orderId", "paymentId", "amount", "reason", "status")
  SELECT ord."id", pay."id", ord."total", 'Refund issued', 'SUCCEEDED'
  FROM payment."Payment" pay
  WHERE pay."orderId" = p_order_id AND pay."status" = 'PAID';
  UPDATE payment."Payment" SET "status" = 'REFUNDED' WHERE "orderId" = p_order_id AND "status" = 'PAID';
  UPDATE sales."Order" SET "paymentStatus" = 'REFUNDED' WHERE "id" = p_order_id;
  INSERT INTO sales."OrderEvent" ("orderId", "status", "note") VALUES (p_order_id, ord."status", 'Refund of ₹' || ord."total" || ' initiated');
END $$;

-- Make one saved address / saved payment the default, atomically (only one per customer).
CREATE OR REPLACE FUNCTION set_default_address(p_user TEXT, p_id TEXT)
RETURNS void LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
BEGIN
  PERFORM 1 FROM account."Address" WHERE "id" = p_id AND "userId" = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING HINT = 'Address'; END IF;
  UPDATE account."Address" SET "isDefault" = ("id" = p_id) WHERE "userId" = p_user AND "isDefault" IS DISTINCT FROM ("id" = p_id);
END $$;

CREATE OR REPLACE FUNCTION set_default_payment(p_user TEXT, p_id TEXT)
RETURNS void LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
BEGIN
  PERFORM 1 FROM payment."SavedPayment" WHERE "id" = p_id AND "userId" = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING HINT = 'Payment method'; END IF;
  UPDATE payment."SavedPayment" SET "isDefault" = ("id" = p_id) WHERE "userId" = p_user AND "isDefault" IS DISTINCT FROM ("id" = p_id);
END $$;

-- Unpaid online orders older than N minutes: cancel them and free the stock.
CREATE OR REPLACE FUNCTION expire_stale_orders(p_minutes INT DEFAULT 30)
RETURNS INT LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN SELECT "id" FROM sales."Order"
           WHERE "status" = 'PLACED' AND "paymentStatus" = 'PENDING' AND "paymentMethod" <> 'COD'
             AND "createdAt" < now() - make_interval(mins => p_minutes) LOOP
    PERFORM fail_payment(r."id", 'Payment window expired');
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Admin stock change: set an exact count or add/remove, always logged.
CREATE OR REPLACE FUNCTION adjust_stock(p_variant_id TEXT, p_mode TEXT, p_quantity INT, p_reason "StockReason",
                                        p_note TEXT, p_user TEXT)
RETURNS JSONB LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
DECLARE
  v catalog."ProductVariant"%ROWTYPE;
  delta INT;
BEGIN
  SELECT * INTO v FROM catalog."ProductVariant" WHERE "id" = p_variant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING HINT = 'Variant'; END IF;
  delta := CASE WHEN p_mode = 'set' THEN p_quantity - v."stock" ELSE p_quantity END;
  IF p_mode = 'set' AND p_quantity < 0 THEN RAISE EXCEPTION 'BAD_STOCK' USING HINT = 'Stock cannot be negative'; END IF;
  IF v."stock" + delta < 0 THEN
    RAISE EXCEPTION 'BAD_STOCK' USING HINT = 'Only ' || v."stock" || ' in stock, cannot remove ' || (-delta);
  END IF;
  IF delta <> 0 THEN
    UPDATE catalog."ProductVariant" SET "stock" = "stock" + delta WHERE "id" = p_variant_id RETURNING * INTO v;
    INSERT INTO catalog."StockMovement" ("variantId", "delta", "reason", "note", "balance", "userId")
      VALUES (p_variant_id, delta, p_reason, p_note, v."stock", NULLIF(p_user, ''));
  END IF;
  RETURN to_jsonb(v);
END $$;

-- Recalculate a product's rating from its approved reviews.
CREATE OR REPLACE FUNCTION recompute_rating(p_product_id TEXT)
RETURNS void LANGUAGE sql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
  UPDATE catalog."Product" SET
    "ratingAvg"   = COALESCE((SELECT round(avg("rating")::numeric, 1) FROM catalog."Review" WHERE "productId" = p_product_id AND "status" = 'APPROVED'), 0),
    "ratingCount" = (SELECT count(*) FROM catalog."Review" WHERE "productId" = p_product_id AND "status" = 'APPROVED')
  WHERE "id" = p_product_id;
$$;

-- Orders and spend per customer (admin Customers page).
CREATE OR REPLACE FUNCTION customer_stats(p_user_ids TEXT[])
RETURNS TABLE ("userId" TEXT, "orders" BIGINT, "spent" BIGINT) LANGUAGE sql STABLE
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
  SELECT o."userId", count(*), COALESCE(sum(o."total"), 0)::bigint
  FROM sales."Order" o
  WHERE o."userId" = ANY (p_user_ids) AND o."status" NOT IN ('CANCELLED', 'RETURNED')
  GROUP BY o."userId";
$$;

-- Everything the admin dashboard charts, in one round trip.
CREATE OR REPLACE FUNCTION admin_analytics(p_days INT DEFAULT 30)
RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  since TIMESTAMPTZ := date_trunc('day', now() - make_interval(days => p_days));
  today TIMESTAMPTZ := date_trunc('day', now());
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'revenue',   COALESCE((SELECT sum("total") FROM sales."Order" WHERE "createdAt" >= since AND "status" NOT IN ('CANCELLED','RETURNED') AND "paymentStatus" IN ('PAID','PENDING')), 0),
    'orders',    (SELECT count(*) FROM sales."Order" WHERE "createdAt" >= since AND "status" NOT IN ('CANCELLED','RETURNED') AND "paymentStatus" IN ('PAID','PENDING')),
    'averageOrderValue', COALESCE((SELECT round(avg("total")) FROM sales."Order" WHERE "createdAt" >= since AND "status" NOT IN ('CANCELLED','RETURNED') AND "paymentStatus" IN ('PAID','PENDING')), 0),
    'couponDiscountGiven', COALESCE((SELECT sum("discount") FROM sales."Order" WHERE "createdAt" >= since AND "status" NOT IN ('CANCELLED','RETURNED') AND "paymentStatus" IN ('PAID','PENDING')), 0),
    'today', jsonb_build_object(
      'revenue', COALESCE((SELECT sum("total") FROM sales."Order" WHERE "createdAt" >= today AND "status" NOT IN ('CANCELLED','RETURNED') AND "paymentStatus" IN ('PAID','PENDING')), 0),
      'orders',  (SELECT count(*) FROM sales."Order" WHERE "createdAt" >= today AND "status" NOT IN ('CANCELLED','RETURNED') AND "paymentStatus" IN ('PAID','PENDING'))),
    'newCustomers', (SELECT count(*) FROM account."Login" WHERE "role" = 'CUSTOMER' AND "createdAt" >= since),
    'ordersByStatus', COALESCE((SELECT jsonb_object_agg("status", n) FROM (SELECT "status", count(*) AS n FROM sales."Order" WHERE "createdAt" >= since GROUP BY "status") s), '{}'::jsonb),
    'daily', (
      SELECT jsonb_agg(jsonb_build_object('day', to_char(d::date, 'YYYY-MM-DD'), 'revenue', COALESCE(x.revenue, 0), 'orders', COALESCE(x.orders, 0)) ORDER BY d)
      FROM generate_series(since::date, (since::date + (p_days - 1)), interval '1 day') AS d
      LEFT JOIN (SELECT date_trunc('day', "createdAt")::date AS day, sum("total") AS revenue, count(*) AS orders
                 FROM sales."Order" WHERE "createdAt" >= since AND "status" NOT IN ('CANCELLED','RETURNED') AND "paymentStatus" IN ('PAID','PENDING') GROUP BY 1) x
        ON x.day = d::date),
    'topProducts', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', name, 'units', units, 'revenue', revenue)) FROM (
        SELECT oi."name" AS name, sum(oi."quantity") AS units, sum(oi."quantity" * oi."unitPrice") AS revenue
        FROM sales."OrderItem" oi JOIN sales."Order" o ON o."id" = oi."orderId"
        WHERE o."createdAt" >= since AND o."status" NOT IN ('CANCELLED','RETURNED')
        GROUP BY oi."name" ORDER BY revenue DESC LIMIT 8) t), '[]'::jsonb),
    'revenueByCategory', COALESCE((SELECT jsonb_agg(jsonb_build_object('category', category, 'revenue', revenue)) FROM (
        SELECT p."categoryId" AS category, sum(oi."quantity" * oi."unitPrice") AS revenue
        FROM sales."OrderItem" oi JOIN sales."Order" o ON o."id" = oi."orderId" JOIN catalog."Product" p ON p."id" = oi."productId"
        WHERE o."createdAt" >= since AND o."status" NOT IN ('CANCELLED','RETURNED')
        GROUP BY 1 ORDER BY revenue DESC) t), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

-- Number of orders in each status (admin Orders tabs).
CREATE OR REPLACE FUNCTION order_status_counts()
RETURNS JSONB LANGUAGE sql STABLE
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
  SELECT COALESCE(jsonb_object_agg("status", n), '{}'::jsonb)
  FROM (SELECT "status", count(*) AS n FROM sales."Order" GROUP BY "status") s;
$$;

-- Replace a product's photo list and keep Product.images in step with ProductImage.
CREATE OR REPLACE FUNCTION set_product_images(p_product_id TEXT, p_urls TEXT[])
RETURNS void LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM catalog."Product" WHERE "id" = p_product_id) THEN
    RAISE EXCEPTION 'NOT_FOUND' USING HINT = 'Product';
  END IF;
  DELETE FROM catalog."ProductImage" WHERE "productId" = p_product_id;
  INSERT INTO catalog."ProductImage" ("productId", "url", "alt", "sortOrder")
  SELECT p_product_id, btrim(url), '', (ord - 1)::int
  FROM unnest(COALESCE(p_urls, ARRAY[]::text[])) WITH ORDINALITY AS t(url, ord)
  WHERE btrim(url) <> '';
  UPDATE catalog."Product" SET "images" = COALESCE((
    SELECT array_agg(btrim(url) ORDER BY ord)
    FROM unnest(COALESCE(p_urls, ARRAY[]::text[])) WITH ORDINALITY AS t(url, ord)
    WHERE btrim(url) <> ''
  ), ARRAY[]::text[])
  WHERE "id" = p_product_id;
END $$;

-- Point an offer at products and categories. An empty list means the whole catalogue.
-- Also refreshes the categoryIds/productIds arrays the shop reads.
CREATE OR REPLACE FUNCTION set_offer_targets(p_offer_id TEXT, p_product_ids TEXT[], p_category_ids TEXT[])
RETURNS void LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM marketing."Offer" WHERE "id" = p_offer_id) THEN
    RAISE EXCEPTION 'NOT_FOUND' USING HINT = 'Offer';
  END IF;
  DELETE FROM marketing."OfferProduct" WHERE "offerId" = p_offer_id;
  DELETE FROM marketing."OfferCategory" WHERE "offerId" = p_offer_id;
  INSERT INTO marketing."OfferProduct" ("offerId", "productId")
  SELECT DISTINCT p_offer_id, btrim(x) FROM unnest(COALESCE(p_product_ids, ARRAY[]::text[])) AS x WHERE btrim(x) <> '';
  INSERT INTO marketing."OfferCategory" ("offerId", "categoryId")
  SELECT DISTINCT p_offer_id, btrim(x) FROM unnest(COALESCE(p_category_ids, ARRAY[]::text[])) AS x WHERE btrim(x) <> '';
  UPDATE marketing."Offer" SET
    "productIds" = COALESCE((SELECT array_agg("productId" ORDER BY "productId") FROM marketing."OfferProduct" WHERE "offerId" = p_offer_id), ARRAY[]::text[]),
    "categoryIds" = COALESCE((SELECT array_agg("categoryId" ORDER BY "categoryId") FROM marketing."OfferCategory" WHERE "offerId" = p_offer_id), ARRAY[]::text[])
  WHERE "id" = p_offer_id;
END $$;

CREATE OR REPLACE FUNCTION set_coupon_targets(p_coupon_id TEXT, p_product_ids TEXT[], p_category_ids TEXT[])
RETURNS void LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM marketing."Coupon" WHERE "id" = p_coupon_id) THEN
    RAISE EXCEPTION 'NOT_FOUND' USING HINT = 'Coupon';
  END IF;
  DELETE FROM marketing."CouponProduct" WHERE "couponId" = p_coupon_id;
  DELETE FROM marketing."CouponCategory" WHERE "couponId" = p_coupon_id;
  INSERT INTO marketing."CouponProduct" ("couponId", "productId")
  SELECT DISTINCT p_coupon_id, btrim(x) FROM unnest(COALESCE(p_product_ids, ARRAY[]::text[])) AS x WHERE btrim(x) <> '';
  INSERT INTO marketing."CouponCategory" ("couponId", "categoryId")
  SELECT DISTINCT p_coupon_id, btrim(x) FROM unnest(COALESCE(p_category_ids, ARRAY[]::text[])) AS x WHERE btrim(x) <> '';
  UPDATE marketing."Coupon" SET
    "productIds" = COALESCE((SELECT array_agg("productId" ORDER BY "productId") FROM marketing."CouponProduct" WHERE "couponId" = p_coupon_id), ARRAY[]::text[]),
    "categoryIds" = COALESCE((SELECT array_agg("categoryId" ORDER BY "categoryId") FROM marketing."CouponCategory" WHERE "couponId" = p_coupon_id), ARRAY[]::text[])
  WHERE "id" = p_coupon_id;
END $$;

-- Seed helper: continue order numbers after the demo orders.
CREATE OR REPLACE FUNCTION bump_order_number(p_min INT)
RETURNS void LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
BEGIN
  PERFORM setval(pg_get_serial_sequence('sales."Order"', 'number'), GREATEST(p_min, (SELECT COALESCE(max("number"), p_min) FROM sales."Order")));
END $$;

-- A previous run created these in account (search_path listed account first).
-- Drop them so rpc() cannot hit a second copy. Triggers already point at public.set_updated_at.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'account'
      AND p.proname IN (
        'set_updated_at', 'restore_stock', 'create_order', 'mark_paid', 'fail_payment',
        'change_order_status', 'finish_refund', 'expire_stale_orders', 'adjust_stock',
        'recompute_rating', 'customer_stats', 'admin_analytics', 'order_status_counts',
        'set_product_images', 'set_offer_targets', 'set_coupon_targets', 'bump_order_number'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS account.%I(%s)', r.proname, r.args);
  END LOOP;
END $$;

-- One row per person for the API to read: login fields plus the name and phone
-- from whichever profile matches the role. Writes go to Login and the profile table.
CREATE OR REPLACE VIEW account."Person" WITH (security_invoker = true) AS
SELECT l."id", l."email", l."passwordHash", l."role", l."isBlocked", l."lastLoginAt",
       l."createdAt", l."updatedAt",
       COALESCE(c."name", s."name", a."name", '') AS "name",
       COALESCE(c."phone", s."phone", a."phone") AS "phone",
       COALESCE(c."avatarUrl", s."avatarUrl", a."avatarUrl") AS "avatarUrl"
FROM account."Login" l
LEFT JOIN account."Customer" c ON c."loginId" = l."id" AND l."role" = 'CUSTOMER'
LEFT JOIN account."Staff" s ON s."loginId" = l."id" AND l."role" = 'STAFF'
LEFT JOIN account."Admin" a ON a."loginId" = l."id" AND l."role" = 'ADMIN';

-- ============================================================================
-- 12. Security
-- Only the API (using the service_role key) reads and writes data. Row Level
-- Security is ON for every table with NO policies, and anon/authenticated are
-- stripped of all access, so the public "publishable" key can read nothing.
-- Do not remove this: it keeps customer, order and password-hash data private.
-- ============================================================================

ALTER TABLE account."Login" ENABLE ROW LEVEL SECURITY;
ALTER TABLE account."Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE account."Staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE account."Admin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE account."RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE account."PasswordReset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE account."Address" ENABLE ROW LEVEL SECURITY;
ALTER TABLE account."DeliveryLocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment."SavedPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment."WebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog."Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog."Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog."ProductVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog."StockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing."Coupon" ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing."CouponRedemption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing."Offer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog."Brand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog."ProductImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing."CouponProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing."CouponCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing."OfferProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing."OfferCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales."Shipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment."Refund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing."Banner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales."CartItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales."WishlistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales."Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales."OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales."OrderEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment."Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog."Review" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops."Setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops."AuditLog" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

DO $$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['account', 'catalog', 'marketing', 'sales', 'payment', 'ops']
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO service_role', s);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM anon, authenticated', s);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM anon, authenticated', s);
    EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO service_role', s);
    EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO service_role', s);
  END LOOP;
END $$;

-- Let the Supabase API see these schemas. If a query says "Invalid schema",
-- also add them under Project Settings -> Data API -> Exposed schemas.
DO $expose$ BEGIN
  EXECUTE 'ALTER ROLE authenticator SET pgrst.db_schemas = ''public, account, catalog, marketing, sales, payment, ops''';
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN NULL;
END $expose$;
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 13. Report views
-- Read-only reports for browsing in the Supabase table editor. Not used by the API.
-- ============================================================================

CREATE OR REPLACE VIEW ops.v_low_stock WITH (security_invoker = true) AS
SELECT p."name" AS product, v."size", v."sku", v."stock", v."lowStockAt"
FROM catalog."ProductVariant" v
JOIN catalog."Product" p ON p."id" = v."productId"
WHERE v."isActive" AND p."isActive" AND v."stock" <= v."lowStockAt"
ORDER BY v."stock", p."name";

CREATE OR REPLACE VIEW ops.v_daily_sales WITH (security_invoker = true) AS
SELECT date_trunc('day', "createdAt")::date AS day,
       COUNT(*)                             AS orders,
       COALESCE(SUM("total"), 0)            AS revenue
FROM sales."Order"
WHERE "status" NOT IN ('CANCELLED', 'RETURNED') AND "paymentStatus" IN ('PAID', 'PENDING')
GROUP BY 1
ORDER BY 1 DESC;

CREATE OR REPLACE VIEW ops.v_catalogue WITH (security_invoker = true) AS
SELECT p."name" AS product, b."name" AS brand, c."name" AS category, v."sku", v."size", v."price", v."mrp", v."stock", p."hsnCode", p."gstPercent", p."isActive"
FROM catalog."Product" p
JOIN catalog."ProductVariant" v ON v."productId" = p."id"
LEFT JOIN catalog."Brand" b ON b."id" = p."brandId"
LEFT JOIN catalog."Category" c ON c."id" = p."categoryId"
ORDER BY p."name", v."sortOrder";

REVOKE ALL ON ops.v_low_stock, ops.v_daily_sales, ops.v_catalogue FROM anon, authenticated;
GRANT SELECT ON ops.v_low_stock, ops.v_daily_sales, ops.v_catalogue TO service_role;

COMMENT ON TABLE account."Login" IS 'Sign-in only: email, password and role. Name and phone live on Customer, Staff or Admin.';
COMMENT ON COLUMN account."Login"."role" IS 'CUSTOMER buys (Customer). STAFF manages the shop (Staff). ADMIN has full access (Admin).';
COMMENT ON TABLE account."Customer" IS 'Buyer profile: name and phone. loginId is the Login row.';
COMMENT ON TABLE account."Staff" IS 'Staff profile for people who manage products, stock, orders, offers, banners and reviews.';
COMMENT ON TABLE account."Admin" IS 'Admin profile. Full access comes from Login.role = ADMIN, not from extra columns.';
COMMENT ON TABLE catalog."Brand" IS 'Product brand, for example ClickMart.';
COMMENT ON TABLE catalog."Category" IS 'Catalogue tree. parentId null is a department; a row with parentId is a subcategory. id is the public slug.';
COMMENT ON TABLE catalog."Product" IS 'A sellable item. Price and stock live on ProductVariant, photos on ProductImage.';
COMMENT ON COLUMN catalog."Review"."images" IS 'Up to four photo URLs a customer attached. Empty until they upload some.';
COMMENT ON COLUMN catalog."Product"."hsnCode" IS 'Indian HSN code used on the tax invoice.';
COMMENT ON COLUMN catalog."Product"."gstPercent" IS 'GST percent for this product. Dry fruits are usually 5.';
COMMENT ON TABLE catalog."ProductImage" IS 'Ordered product photos. The images array on Product is a copy kept in sync by set_product_images.';
COMMENT ON TABLE catalog."ProductVariant" IS 'One SKU: pack size, barcode, selling price, MRP and on-hand stock.';
COMMENT ON TABLE catalog."StockMovement" IS 'Every stock change, with the balance after the change.';
COMMENT ON TABLE marketing."Coupon" IS 'A code the customer types at checkout.';
COMMENT ON COLUMN marketing."Coupon"."categoryIds" IS 'Copy of CouponCategory, refreshed by set_coupon_targets. Empty means the whole catalogue.';
COMMENT ON COLUMN marketing."Coupon"."productIds" IS 'Copy of CouponProduct, refreshed by set_coupon_targets. Empty means the whole catalogue.';
COMMENT ON TABLE marketing."Offer" IS 'An automatic sale price. No code required.';
COMMENT ON COLUMN marketing."Offer"."categoryIds" IS 'Copy of OfferCategory, refreshed by set_offer_targets. Empty means the whole catalogue.';
COMMENT ON COLUMN marketing."Offer"."productIds" IS 'Copy of OfferProduct, refreshed by set_offer_targets. Empty means the whole catalogue.';
COMMENT ON TABLE sales."Order" IS 'A placed order. Address and totals are stored here so they never change after checkout.';
COMMENT ON TABLE sales."OrderItem" IS 'One line, with the name, pack, price, HSN and GST copied at purchase time.';
COMMENT ON TABLE sales."Shipment" IS 'Courier and tracking number for an order.';
COMMENT ON TABLE payment."Refund" IS 'Money returned to the customer for an order.';
COMMENT ON TABLE payment."WebhookEvent" IS 'Signed gateway notifications, one row per event id.';
COMMENT ON TABLE payment."Payment" IS 'One attempt to collect the order total.';

-- ============================================================================
-- 14. Starter data
-- Store settings and the three launch coupons. Products, categories, banners and the
-- admin user are loaded by `npm run db:seed`.
-- ============================================================================

INSERT INTO catalog."Brand" ("id", "name", "slug") VALUES ('brand_clickmart', 'ClickMart', 'clickmart')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO ops."Setting" ("key", "value") VALUES
  ('storeName',             '"ClickMart"'),
  ('supportEmail',          '"hello@clickmart.com"'),
  ('supportPhone',          '"+91 80 4567 8900"'),
  ('address',               '"42, Residency Road, Bengaluru 560025"'),
  ('freeShippingThreshold', '499'),
  ('shippingFee',           '49'),
  ('codEnabled',            'true'),
  ('codMaxOrder',           '5000'),
  ('lowStockDefault',       '10')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO marketing."Coupon" ("code", "label", "type", "value") VALUES
  ('DRY15',     '15% off all dry fruits', 'PERCENT',       15),
  ('WELCOME10', '10% off your order',     'PERCENT',       10),
  ('FREESHIP',  'Free shipping',          'FREE_SHIPPING',  0)
ON CONFLICT ("code") DO NOTHING;

-- ============================================================================
-- 15. Image storage
-- Four public buckets. The API uploads with the service key and saves the URL.
--   product-images   photos of items
--   category-images  category photos
--   banner-images    homepage banners
--   profile-images   customer, staff and admin profile photos
--   review-images    photos customers attach to a review
-- Skipped on plain Postgres (the local test stack), which uses backend/uploads.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES
      ('product-images',  'product-images',  true, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
      ('category-images', 'category-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
      ('banner-images',   'banner-images',   true, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
      ('profile-images',  'profile-images',  true, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
      ('review-images',   'review-images',   true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
    ON CONFLICT (id) DO UPDATE
      SET public = true,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END $$;
