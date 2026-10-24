-- Booking a real NimbusPost order from the admin order drawer: links our order to NimbusPost's order id,
-- tracks its last known status, and holds the e-way bill once set. Paste into the Supabase SQL Editor.
-- Safe to run again. The full database still lives in backend/supabase/schema.sql.

ALTER TABLE sales."Shipment" ADD COLUMN IF NOT EXISTS "nimbuspostOrderId" TEXT;
ALTER TABLE sales."Shipment" ADD COLUMN IF NOT EXISTS "nimbuspostOrderNumber" TEXT;
ALTER TABLE sales."Shipment" ADD COLUMN IF NOT EXISTS "nimbuspostStatus" TEXT;
ALTER TABLE sales."Shipment" ADD COLUMN IF NOT EXISTS "ewayBillNumber" TEXT;

NOTIFY pgrst, 'reload schema';
