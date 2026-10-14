-- Admin and operations: finer staff permissions and support alerts.
-- Paste this file into the Supabase SQL Editor (project in backend/.env) and Run.
-- Safe to run again. Existing staff keep the access they have today.
--
-- Needs 2026-10-14-customer-support.sql to have been run first.
-- The full database still lives in backend/supabase/schema.sql (section 17 is this file).

SET search_path = public, account, catalog, marketing, sales, payment, ops;

-- What each staff member may open in the admin app. Admins always have everything.
-- Keys: orders, catalog, inventory, marketing, support, customers, reports.
-- The default is what staff could already do, so nobody loses access when this runs.
ALTER TABLE account."Staff" ADD COLUMN IF NOT EXISTS "permissions" TEXT[] NOT NULL DEFAULT ARRAY['orders','catalog','inventory','marketing','support','customers']::text[];

DO $$ BEGIN
  ALTER TABLE account."Staff" ADD CONSTRAINT "Staff_permissions_check"
    CHECK ("permissions" <@ ARRAY['orders','catalog','inventory','marketing','support','customers','reports']::text[]);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Set when we told the team a ticket is past its reply target, so we tell them once.
ALTER TABLE ops."SupportTicket" ADD COLUMN IF NOT EXISTS "slaAlertedAt" TIMESTAMPTZ(3);

-- Same as before, plus: a customer reply starts a new reply target, so it may alert again.
CREATE OR REPLACE FUNCTION add_support_message(p_ticket_id TEXT, p_author_id TEXT, p_author_role TEXT, p_author_name TEXT,
                                               p_body TEXT, p_internal BOOLEAN, p_attachments TEXT[])
RETURNS JSONB LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
DECLARE
  t ops."SupportTicket"%ROWTYPE;
  m ops."SupportMessage"%ROWTYPE;
BEGIN
  SELECT * INTO t FROM ops."SupportTicket" WHERE "id" = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING HINT = 'Ticket'; END IF;
  IF p_author_role = 'CUSTOMER' AND t."status" = 'CLOSED' THEN RAISE EXCEPTION 'TICKET_CLOSED'; END IF;

  INSERT INTO ops."SupportMessage" ("ticketId", "authorId", "authorRole", "authorName", "body", "isInternal", "attachments")
  VALUES (p_ticket_id, p_author_id, p_author_role, p_author_name, p_body, COALESCE(p_internal, false), COALESCE(p_attachments, ARRAY[]::text[]))
  RETURNING * INTO m;

  IF COALESCE(p_internal, false) THEN
    UPDATE ops."SupportTicket" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = p_ticket_id;
  ELSIF p_author_role = 'STAFF' THEN
    UPDATE ops."SupportTicket" SET
      "status" = CASE WHEN t."status" IN ('OPEN', 'IN_PROGRESS') THEN 'WAITING_CUSTOMER'::ops."TicketStatus" ELSE t."status" END,
      "assigneeId" = COALESCE(t."assigneeId", p_author_id),
      "firstResponseAt" = COALESCE(t."firstResponseAt", CURRENT_TIMESTAMP),
      "lastMessageAt" = CURRENT_TIMESTAMP,
      "lastMessageBy" = 'STAFF',
      "customerUnread" = true,
      "staffUnread" = false,
      "dueAt" = NULL,
      "slaAlertedAt" = NULL
    WHERE "id" = p_ticket_id;
  ELSE
    UPDATE ops."SupportTicket" SET
      "status" = CASE WHEN t."status" IN ('WAITING_CUSTOMER', 'RESOLVED') THEN 'OPEN'::ops."TicketStatus" ELSE t."status" END,
      "resolvedAt" = CASE WHEN t."status" = 'RESOLVED' THEN NULL ELSE t."resolvedAt" END,
      "lastMessageAt" = CURRENT_TIMESTAMP,
      "lastMessageBy" = 'CUSTOMER',
      "staffUnread" = true,
      "customerUnread" = false,
      "dueAt" = CASE WHEN t."lastMessageBy" = 'STAFF' OR t."status" = 'RESOLVED' THEN now() + make_interval(hours => support_sla_hours(t."priority")) ELSE t."dueAt" END,
      "slaAlertedAt" = CASE WHEN t."lastMessageBy" = 'STAFF' OR t."status" = 'RESOLVED' THEN NULL ELSE t."slaAlertedAt" END
    WHERE "id" = p_ticket_id;
  END IF;
  RETURN to_jsonb(m);
END $$;

-- Tickets that just went past their reply target and have not been reported yet.
-- Marks them reported in the same statement, so two servers never send the same alert.
CREATE OR REPLACE FUNCTION claim_overdue_support_tickets()
RETURNS TABLE ("id" TEXT, "number" INTEGER, "subject" TEXT, "priority" ops."TicketPriority", "dueAt" TIMESTAMPTZ, "name" TEXT)
LANGUAGE sql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
  UPDATE ops."SupportTicket" t SET "slaAlertedAt" = CURRENT_TIMESTAMP
  WHERE t."dueAt" < now() AND t."status" IN ('OPEN', 'IN_PROGRESS') AND t."slaAlertedAt" IS NULL
  RETURNING t."id", t."number", t."subject", t."priority", t."dueAt", t."name";
$$;

REVOKE ALL ON FUNCTION add_support_message(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_overdue_support_tickets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION add_support_message(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION claim_overdue_support_tickets() TO service_role;

NOTIFY pgrst, 'reload schema';
