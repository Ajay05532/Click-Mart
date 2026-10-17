-- Search listing text for products and categories, set from the admin app.
-- Paste this file into the Supabase SQL Editor (project in backend/.env) and Run.
-- Safe to run again. Existing rows get empty text, and the shop keeps writing their
-- titles and descriptions from the name, price and description until you fill these in.
--
-- The full database still lives in backend/supabase/schema.sql.

ALTER TABLE catalog."Product" ADD COLUMN IF NOT EXISTS "metaTitle" TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog."Product" ADD COLUMN IF NOT EXISTS "metaDescription" TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog."Category" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog."Category" ADD COLUMN IF NOT EXISTS "metaTitle" TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog."Category" ADD COLUMN IF NOT EXISTS "metaDescription" TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN catalog."Product"."metaTitle" IS 'Title shown in Google results. Empty means "<name> — Buy Online".';
COMMENT ON COLUMN catalog."Product"."metaDescription" IS 'Description shown in Google results. Empty means it is written from price and description.';
COMMENT ON COLUMN catalog."Category"."description" IS 'Intro paragraph shown on the category page and read by search engines.';
COMMENT ON COLUMN catalog."Category"."metaTitle" IS 'Title shown in Google results. Empty means "Buy <name> Online".';
COMMENT ON COLUMN catalog."Category"."metaDescription" IS 'Description shown in Google results. Empty means it is written from the tagline.';

NOTIFY pgrst, 'reload schema';
