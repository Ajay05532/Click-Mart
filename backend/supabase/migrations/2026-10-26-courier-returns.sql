-- Return pickups through NimbusPost, and fast lookups for its tracking webhook.
-- A return is a reverse courier order (buyer -> our warehouse) linked to the original shipment row.
-- Paste into the Supabase SQL Editor and Run. Safe to run again. Run 2026-10-24-nimbuspost-orders.sql first.
-- The full database still lives in schema.sql.

ALTER TABLE sales."Shipment" ADD COLUMN IF NOT EXISTS "returnProviderOrderId" TEXT;
ALTER TABLE sales."Shipment" ADD COLUMN IF NOT EXISTS "returnAwb" TEXT;
ALTER TABLE sales."Shipment" ADD COLUMN IF NOT EXISTS "returnCourier" TEXT;
ALTER TABLE sales."Shipment" ADD COLUMN IF NOT EXISTS "returnStatus" TEXT;
ALTER TABLE sales."Shipment" ADD COLUMN IF NOT EXISTS "returnReason" TEXT;

-- The webhook finds a shipment by NimbusPost's order id (forward or return) on every event.
CREATE INDEX IF NOT EXISTS "Shipment_providerOrderId_idx" ON sales."Shipment"("providerOrderId");
CREATE INDEX IF NOT EXISTS "Shipment_returnProviderOrderId_idx" ON sales."Shipment"("returnProviderOrderId");

NOTIFY pgrst, 'reload schema';
