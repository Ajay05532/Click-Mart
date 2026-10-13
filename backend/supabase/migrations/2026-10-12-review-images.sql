-- Customer photos on reviews, plus the public bucket those photos are stored in.
-- Paste this file into the Supabase SQL Editor (project in backend/.env) and Run.
-- Safe to run again. Existing reviews stay, with an empty photo list.
--
-- The full database still lives in backend/supabase/schema.sql.

ALTER TABLE catalog."Review" ADD COLUMN IF NOT EXISTS "images" TEXT[] NOT NULL DEFAULT ARRAY[]::text[];

COMMENT ON COLUMN catalog."Review"."images" IS 'Up to four photo URLs a customer attached. Empty until they upload some.';

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('review-images', 'review-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
    ON CONFLICT (id) DO UPDATE
      SET public = true,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
