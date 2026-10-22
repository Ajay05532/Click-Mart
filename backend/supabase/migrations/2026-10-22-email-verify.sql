-- Email verification at sign-up: a customer must confirm a 6-digit code emailed to them before
-- they can log in. Reuses the account."PasswordReset" table (kind = 'verify') built for the
-- password-reset code, so no new table. Paste this into the Supabase SQL Editor and Run. Safe to run again.
--
-- Until it is pasted, registering fails with "column emailVerifiedAt does not exist".
--
-- The full database still lives in backend/supabase/schema.sql.

-- The default marks older rows and staff/admin rows as verified; sign-up inserts NULL, so the column must allow it.
ALTER TABLE account."Login" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE account."Login" ALTER COLUMN "emailVerifiedAt" DROP NOT NULL;
COMMENT ON COLUMN account."Login"."emailVerifiedAt" IS 'NULL until a self-registered customer confirms the emailed code. Staff/admin rows and older rows default to verified.';

-- Postgres will not let CREATE OR REPLACE VIEW rename or reorder existing columns (error 42P16), only append
-- new ones at the end, so emailVerifiedAt goes last here even though it sits earlier in schema.sql's table.
DROP VIEW IF EXISTS account."Person";
CREATE VIEW account."Person" WITH (security_invoker = true) AS
SELECT l."id", l."email", l."passwordHash", l."role", l."isBlocked", l."lastLoginAt",
       l."createdAt", l."updatedAt",
       COALESCE(c."name", s."name", a."name", '') AS "name",
       COALESCE(c."phone", s."phone", a."phone") AS "phone",
       COALESCE(c."avatarUrl", s."avatarUrl", a."avatarUrl") AS "avatarUrl",
       l."emailVerifiedAt"
FROM account."Login" l
LEFT JOIN account."Customer" c ON c."loginId" = l."id" AND l."role" = 'CUSTOMER'
LEFT JOIN account."Staff" s ON s."loginId" = l."id" AND l."role" = 'STAFF'
LEFT JOIN account."Admin" a ON a."loginId" = l."id" AND l."role" = 'ADMIN';

NOTIFY pgrst, 'reload schema';
