-- Password reset by emailed 6-digit code. A code row counts wrong tries so it locks after 5.
-- Paste this file into the Supabase SQL Editor (project in backend/.env) and Run. Safe to run again.
-- Until it is pasted, "Forgot password" cannot send a code.
--
-- The full database still lives in backend/supabase/schema.sql.

ALTER TABLE account."PasswordReset" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'link';
ALTER TABLE account."PasswordReset" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN account."PasswordReset"."kind" IS 'code = 6-digit code emailed to the user; link = one-time token given after the code is confirmed.';
COMMENT ON COLUMN account."PasswordReset"."attempts" IS 'Wrong code entries. The code stops working after 5.';

NOTIFY pgrst, 'reload schema';
