-- Booking a real courier order from the admin order drawer: links our order to the courier's own order id,
-- tracks its last known status, and holds the e-way bill once set. Generic column names (not "nimbuspost...")
-- so switching couriers later needs no schema change -- "provider" records which one booked it.
-- Paste into the Supabase SQL Editor. Safe to run again, and safe even if you already ran an earlier
-- version of this file that created the old "nimbuspost..." names -- this renames them in place.
-- The full database still lives in schema.sql.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'sales' AND table_name = 'Shipment' AND column_name = 'nimbuspostOrderId')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'sales' AND table_name = 'Shipment' AND column_name = 'providerOrderId') THEN
    ALTER TABLE sales."Shipment" RENAME COLUMN "nimbuspostOrderId" TO "providerOrderId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'sales' AND table_name = 'Shipment' AND column_name = 'nimbuspostOrderNumber')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'sales' AND table_name = 'Shipment' AND column_name = 'providerOrderNumber') THEN
    ALTER TABLE sales."Shipment" RENAME COLUMN "nimbuspostOrderNumber" TO "providerOrderNumber";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'sales' AND table_name = 'Shipment' AND column_name = 'nimbuspostStatus')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'sales' AND table_name = 'Shipment' AND column_name = 'providerStatus') THEN
    ALTER TABLE sales."Shipment" RENAME COLUMN "nimbuspostStatus" TO "providerStatus";
  END IF;
END $$;

-- Covers a fresh database that never had the old names, and is a no-op once the columns above exist.
ALTER TABLE sales."Shipment" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE sales."Shipment" ADD COLUMN IF NOT EXISTS "providerOrderId" TEXT;
ALTER TABLE sales."Shipment" ADD COLUMN IF NOT EXISTS "providerOrderNumber" TEXT;
ALTER TABLE sales."Shipment" ADD COLUMN IF NOT EXISTS "providerStatus" TEXT;
ALTER TABLE sales."Shipment" ADD COLUMN IF NOT EXISTS "ewayBillNumber" TEXT;

-- Backfill: any row already booked (from the short window this ran under the old column names) is NimbusPost.
UPDATE sales."Shipment" SET "provider" = 'nimbuspost' WHERE "providerOrderId" IS NOT NULL AND "provider" IS NULL;

NOTIFY pgrst, 'reload schema';
