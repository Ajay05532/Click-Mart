-- Delivery location for the header "Set PIN" map.
-- Paste this file into the Supabase SQL Editor (project in backend/.env) and Run.
-- Safe to run again. Does not touch existing rows.
--
-- The full database still lives in backend/supabase/schema.sql. This file is only
-- the new statement, so you do not have to paste the whole schema.

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

ALTER TABLE account."DeliveryLocation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE account."DeliveryLocation" FROM anon, authenticated;
GRANT ALL ON TABLE account."DeliveryLocation" TO service_role;

NOTIFY pgrst, 'reload schema';
