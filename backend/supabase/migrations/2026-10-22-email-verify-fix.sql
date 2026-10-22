-- Fix for 2026-10-22-email-verify.sql: the first version created "emailVerifiedAt" as NOT NULL, so every
-- sign-up failed with 'null value in column "emailVerifiedAt" ... violates not-null constraint'.
-- New customers are saved with NULL until they confirm the emailed code. Existing rows keep their date
-- (they count as verified). Paste this into the Supabase SQL Editor and Run. Safe to run again.

ALTER TABLE account."Login" ALTER COLUMN "emailVerifiedAt" DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
