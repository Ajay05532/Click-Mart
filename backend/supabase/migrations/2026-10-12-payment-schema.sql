-- Payment schema: payments, refunds, saved UPI/cards, and the gateway webhook log.
-- Paste this file into the Supabase SQL Editor (project in backend/.env) and Run.
-- Safe to run again. Existing payment rows are kept: tables in sales, account, or public
-- are moved into payment instead of being recreated.
--
-- After it finishes, Project Settings -> Data API -> Exposed schemas must include
-- payment (this file also tries to set that). Then the API can see the tables.
--
-- The full database still lives in backend/supabase/schema.sql.

CREATE SCHEMA IF NOT EXISTS payment;
CREATE SCHEMA IF NOT EXISTS sales;
CREATE SCHEMA IF NOT EXISTS account;

-- Enums may still be sitting in public from an older paste.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
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
  CREATE TYPE sales."RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Move older copies. Rows stay.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Payment','sales'), ('Refund','sales'), ('SavedPayment','account'),
    ('SavedPayment','public'), ('Payment','public'), ('Refund','public')
  ) AS t(tbl, src)
  LOOP
    IF to_regclass(format('%I.%I', r.src, r.tbl)) IS NOT NULL AND to_regclass(format('payment.%I', r.tbl)) IS NULL THEN
      EXECUTE format('ALTER TABLE %I.%I SET SCHEMA payment', r.src, r.tbl);
    END IF;
  END LOOP;
END $$;

SET search_path = public, sales, payment, account;

-- SavedPayment never holds a full card number or CVV.
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

ALTER TABLE payment."SavedPayment" ADD COLUMN IF NOT EXISTS "upiId" TEXT;
ALTER TABLE payment."SavedPayment" ADD COLUMN IF NOT EXISTS "cardBrand" TEXT;
ALTER TABLE payment."SavedPayment" ADD COLUMN IF NOT EXISTS "last4" TEXT;
ALTER TABLE payment."SavedPayment" ADD COLUMN IF NOT EXISTS "expMonth" INTEGER;
ALTER TABLE payment."SavedPayment" ADD COLUMN IF NOT EXISTS "expYear" INTEGER;
ALTER TABLE payment."SavedPayment" ADD COLUMN IF NOT EXISTS "holderName" TEXT;
ALTER TABLE payment."SavedPayment" ADD COLUMN IF NOT EXISTS "nickname" TEXT;
ALTER TABLE payment."SavedPayment" ADD COLUMN IF NOT EXISTS "gatewayToken" TEXT;
ALTER TABLE payment."SavedPayment" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE payment."SavedPayment" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE payment."Payment" ADD COLUMN IF NOT EXISTS "detail" TEXT;
ALTER TABLE payment."Payment" ADD COLUMN IF NOT EXISTS "upiId" TEXT;
ALTER TABLE payment."Payment" ADD COLUMN IF NOT EXISTS "cardBrand" TEXT;
ALTER TABLE payment."Payment" ADD COLUMN IF NOT EXISTS "cardLast4" TEXT;
ALTER TABLE payment."Payment" ADD COLUMN IF NOT EXISTS "bank" TEXT;
ALTER TABLE payment."Payment" ADD COLUMN IF NOT EXISTS "savedPaymentId" TEXT;
ALTER TABLE payment."Payment" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
ALTER TABLE payment."Payment" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMPTZ(3);

ALTER TABLE sales."Order" ADD COLUMN IF NOT EXISTS "paymentDetail" TEXT;

CREATE INDEX IF NOT EXISTS "SavedPayment_userId_idx" ON payment."SavedPayment"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "SavedPayment_upi_key" ON payment."SavedPayment"("userId", lower("upiId")) WHERE "kind" = 'UPI';
CREATE UNIQUE INDEX IF NOT EXISTS "SavedPayment_card_key" ON payment."SavedPayment"("userId", "cardBrand", "last4", "expMonth", "expYear") WHERE "kind" = 'CARD';
CREATE INDEX IF NOT EXISTS "Payment_orderId_idx" ON payment."Payment"("orderId");
CREATE INDEX IF NOT EXISTS "Payment_providerOrderId_idx" ON payment."Payment"("providerOrderId");
CREATE UNIQUE INDEX IF NOT EXISTS "WebhookEvent_provider_eventId_key" ON payment."WebhookEvent"("provider", "eventId");
CREATE INDEX IF NOT EXISTS "WebhookEvent_receivedAt_idx" ON payment."WebhookEvent"("receivedAt" DESC);
CREATE INDEX IF NOT EXISTS "Refund_orderId_idx" ON payment."Refund"("orderId");

DO $$ BEGIN ALTER TABLE payment."WebhookEvent" ADD CONSTRAINT "WebhookEvent_status_check" CHECK ("status" IN ('RECEIVED','PROCESSED','IGNORED','FAILED')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payment."Refund" ADD CONSTRAINT "Refund_amount_check" CHECK ("amount" > 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payment."SavedPayment" ADD CONSTRAINT "SavedPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES account."Login"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payment."SavedPayment" ADD CONSTRAINT "SavedPayment_kind_check" CHECK ("kind" IN ('UPI', 'CARD') AND (("kind" = 'UPI' AND "upiId" IS NOT NULL) OR ("kind" = 'CARD' AND "last4" IS NOT NULL AND "expMonth" BETWEEN 1 AND 12))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payment."Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES sales."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payment."Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES sales."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payment."Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES payment."Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payment."Refund" ADD CONSTRAINT "Refund_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES account."Login"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- public is first so these replace the copies PostgREST already calls.
SET search_path = public, account, catalog, marketing, sales, payment, ops;

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
    UPDATE sales."Order" SET "paymentStatus" = 'PAID' WHERE "id" = ord."id";
    RETURN jsonb_build_object('orderId', ord."id", 'changed', false, 'needsRefund', true);
  END IF;
  UPDATE sales."Order" SET "paymentStatus" = 'PAID', "status" = 'CONFIRMED' WHERE "id" = ord."id";
  INSERT INTO sales."OrderEvent" ("orderId", "status", "note") VALUES (ord."id", 'CONFIRMED', 'Payment received. Order confirmed.');
  RETURN jsonb_build_object('orderId', ord."id", 'changed', true);
END $$;

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

CREATE OR REPLACE FUNCTION set_default_payment(p_user TEXT, p_id TEXT)
RETURNS void LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
BEGIN
  PERFORM 1 FROM payment."SavedPayment" WHERE "id" = p_id AND "userId" = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING HINT = 'Payment method'; END IF;
  UPDATE payment."SavedPayment" SET "isDefault" = ("id" = p_id) WHERE "userId" = p_user AND "isDefault" IS DISTINCT FROM ("id" = p_id);
END $$;

ALTER TABLE payment."SavedPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment."Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment."Refund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment."WebhookEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

GRANT USAGE ON SCHEMA payment TO service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA payment FROM anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA payment TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA payment TO service_role;

DO $expose$ BEGIN
  EXECUTE 'ALTER ROLE authenticator SET pgrst.db_schemas = ''public, account, catalog, marketing, sales, payment, ops''';
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN NULL;
END $expose$;

COMMENT ON TABLE payment."Payment" IS 'One attempt to collect the order total.';
COMMENT ON TABLE payment."Refund" IS 'Money returned to the customer for an order.';
COMMENT ON TABLE payment."SavedPayment" IS 'Saved UPI ID or card label. Never a full card number or CVV.';
COMMENT ON TABLE payment."WebhookEvent" IS 'Signed gateway notifications, one row per event id.';

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
