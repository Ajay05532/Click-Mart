-- Customer support: help articles (FAQ), support tickets with a conversation thread,
-- staff canned replies, satisfaction ratings, and the bucket for photos attached to a ticket.
-- Paste this file into the Supabase SQL Editor (project in backend/.env) and Run.
-- Safe to run again. Does not touch existing rows. Everything lives in the existing `ops`
-- schema, so nothing new has to be exposed under Project Settings -> Data API.
--
-- The full database still lives in backend/supabase/schema.sql (section 16 is this file).

SET search_path = public, account, catalog, marketing, sales, payment, ops;

-- ============================================================================
-- Enums
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE ops."TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ops."TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Tables
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS ops."SupportTicket_number_seq" START WITH 1001;

-- One customer problem. Shown to the customer as TKT-<number>.
CREATE TABLE IF NOT EXISTS ops."SupportTicket" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "number" INTEGER NOT NULL DEFAULT nextval('ops."SupportTicket_number_seq"'::regclass),
    "userId" TEXT,
    "orderId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" ops."TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" ops."TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "assigneeId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'HELP',
    "lastMessageAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageBy" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "staffUnread" BOOLEAN NOT NULL DEFAULT true,
    "customerUnread" BOOLEAN NOT NULL DEFAULT false,
    "firstResponseAt" TIMESTAMPTZ(3),
    "dueAt" TIMESTAMPTZ(3),
    "resolvedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "rating" INTEGER,
    "ratingComment" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SupportTicket_category_check" CHECK ("category" IN ('ORDER_STATUS', 'DELIVERY', 'PAYMENT', 'REFUND_RETURN', 'PRODUCT_QUALITY', 'WRONG_OR_MISSING', 'ACCOUNT', 'COUPON_OFFER', 'OTHER')),
    CONSTRAINT "SupportTicket_source_check" CHECK ("source" IN ('ORDER', 'HELP', 'CONTACT')),
    CONSTRAINT "SupportTicket_lastMessageBy_check" CHECK ("lastMessageBy" IN ('CUSTOMER', 'STAFF')),
    CONSTRAINT "SupportTicket_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5),
    CONSTRAINT "SupportTicket_subject_check" CHECK (char_length("subject") BETWEEN 3 AND 150)
);

-- Every message in a ticket. Internal notes are only visible to staff.
CREATE TABLE IF NOT EXISTS ops."SupportMessage" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorRole" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "attachments" TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SupportMessage_authorRole_check" CHECK ("authorRole" IN ('CUSTOMER', 'STAFF', 'SYSTEM')),
    CONSTRAINT "SupportMessage_body_check" CHECK (char_length("body") BETWEEN 1 AND 5000)
);

-- Help-centre articles. Written and published from the admin app.
CREATE TABLE IF NOT EXISTS ops."Faq" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "helpfulYes" INTEGER NOT NULL DEFAULT 0,
    "helpfulNo" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Faq_category_check" CHECK ("category" IN ('ORDERS', 'DELIVERY', 'PAYMENTS', 'RETURNS', 'PRODUCTS', 'ACCOUNT'))
);

-- Saved answers staff can drop into a reply.
CREATE TABLE IF NOT EXISTS ops."CannedReply" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CannedReply_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- Links, indexes, triggers
-- ============================================================================

DO $$ BEGIN ALTER TABLE ops."SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES account."Login"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ops."SupportTicket" ADD CONSTRAINT "SupportTicket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES account."Login"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ops."SupportTicket" ADD CONSTRAINT "SupportTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES sales."Order"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ops."SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES ops."SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ops."SupportMessage" ADD CONSTRAINT "SupportMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES account."Login"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "SupportTicket_number_key" ON ops."SupportTicket"("number");
CREATE INDEX IF NOT EXISTS "SupportTicket_userId_idx" ON ops."SupportTicket"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SupportTicket_inbox_idx" ON ops."SupportTicket"("status", "lastMessageAt" DESC);
CREATE INDEX IF NOT EXISTS "SupportTicket_assigneeId_idx" ON ops."SupportTicket"("assigneeId");
CREATE INDEX IF NOT EXISTS "SupportTicket_orderId_idx" ON ops."SupportTicket"("orderId");
CREATE INDEX IF NOT EXISTS "SupportMessage_ticketId_idx" ON ops."SupportMessage"("ticketId", "createdAt");
CREATE INDEX IF NOT EXISTS "Faq_list_idx" ON ops."Faq"("isPublished", "category", "sortOrder");

DROP TRIGGER IF EXISTS "SupportTicket_updated_at" ON ops."SupportTicket";
CREATE TRIGGER "SupportTicket_updated_at" BEFORE UPDATE ON ops."SupportTicket" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS "Faq_updated_at" ON ops."Faq";
CREATE TRIGGER "Faq_updated_at" BEFORE UPDATE ON ops."Faq" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS "CannedReply_updated_at" ON ops."CannedReply";
CREATE TRIGGER "CannedReply_updated_at" BEFORE UPDATE ON ops."CannedReply" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- Functions. Each runs as one transaction and is callable by service_role only.
-- Raised tags the API understands: NOT_FOUND | TICKET_CLOSED
-- ============================================================================

-- Hours we aim to give a first answer in, by priority.
CREATE OR REPLACE FUNCTION support_sla_hours(p_priority ops."TicketPriority")
RETURNS INT LANGUAGE sql IMMUTABLE
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
  SELECT CASE p_priority WHEN 'URGENT' THEN 2 WHEN 'HIGH' THEN 8 WHEN 'NORMAL' THEN 24 ELSE 48 END;
$$;

-- Open a ticket together with the customer's first message.
CREATE OR REPLACE FUNCTION create_support_ticket(p JSONB)
RETURNS JSONB LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
DECLARE
  t ops."SupportTicket"%ROWTYPE;
  prio ops."TicketPriority" := COALESCE(p->>'priority', 'NORMAL')::ops."TicketPriority";
  files TEXT[] := COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p->'attachments', '[]'::jsonb))), ARRAY[]::text[]);
BEGIN
  INSERT INTO ops."SupportTicket" ("userId", "orderId", "name", "email", "phone", "category", "subject", "priority", "source", "dueAt")
  VALUES (
    NULLIF(p->>'userId', ''), NULLIF(p->>'orderId', ''), p->>'name', lower(p->>'email'), NULLIF(p->>'phone', ''),
    p->>'category', p->>'subject', prio, COALESCE(p->>'source', 'HELP'),
    now() + make_interval(hours => support_sla_hours(prio))
  )
  RETURNING * INTO t;
  INSERT INTO ops."SupportMessage" ("ticketId", "authorId", "authorRole", "authorName", "body", "attachments")
  VALUES (t."id", NULLIF(p->>'userId', ''), 'CUSTOMER', p->>'name', p->>'body', files);
  RETURN jsonb_build_object('id', t."id", 'number', t."number");
END $$;

-- Add a message and move the ticket the way a help desk would:
--   staff reply  -> waiting on the customer, first-response time recorded
--   customer reply -> back to open (also re-opens a resolved ticket)
--   internal note -> nothing changes for the customer
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
      "dueAt" = NULL
    WHERE "id" = p_ticket_id;
  ELSE
    UPDATE ops."SupportTicket" SET
      "status" = CASE WHEN t."status" IN ('WAITING_CUSTOMER', 'RESOLVED') THEN 'OPEN'::ops."TicketStatus" ELSE t."status" END,
      "resolvedAt" = CASE WHEN t."status" = 'RESOLVED' THEN NULL ELSE t."resolvedAt" END,
      "lastMessageAt" = CURRENT_TIMESTAMP,
      "lastMessageBy" = 'CUSTOMER',
      "staffUnread" = true,
      "customerUnread" = false,
      "dueAt" = CASE WHEN t."lastMessageBy" = 'STAFF' OR t."status" = 'RESOLVED' THEN now() + make_interval(hours => support_sla_hours(t."priority")) ELSE t."dueAt" END
    WHERE "id" = p_ticket_id;
  END IF;
  RETURN to_jsonb(m);
END $$;

-- Tidy up on a timer (the API calls this every few minutes):
--   resolved for N days  -> closed
--   waiting on the customer for N days -> resolved, with a note in the thread
CREATE OR REPLACE FUNCTION auto_close_support_tickets(p_days INT DEFAULT 7)
RETURNS INT LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
DECLARE n INT := 0; stale RECORD;
BEGIN
  UPDATE ops."SupportTicket" SET "status" = 'CLOSED', "closedAt" = CURRENT_TIMESTAMP
  WHERE "status" = 'RESOLVED' AND "resolvedAt" < now() - make_interval(days => p_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  FOR stale IN
    SELECT "id" FROM ops."SupportTicket"
    WHERE "status" = 'WAITING_CUSTOMER' AND "lastMessageAt" < now() - make_interval(days => p_days) FOR UPDATE
  LOOP
    UPDATE ops."SupportTicket" SET "status" = 'RESOLVED', "resolvedAt" = CURRENT_TIMESTAMP, "customerUnread" = true WHERE "id" = stale."id";
    INSERT INTO ops."SupportMessage" ("ticketId", "authorRole", "authorName", "body")
    VALUES (stale."id", 'SYSTEM', 'ClickMart', 'We did not hear back, so we marked this as resolved. Reply here any time to re-open it.');
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Numbers for the admin support dashboard.
CREATE OR REPLACE FUNCTION support_stats()
RETURNS JSONB LANGUAGE sql STABLE
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
  SELECT jsonb_build_object(
    'open',        count(*) FILTER (WHERE "status" = 'OPEN'),
    'inProgress',  count(*) FILTER (WHERE "status" = 'IN_PROGRESS'),
    'waiting',     count(*) FILTER (WHERE "status" = 'WAITING_CUSTOMER'),
    'resolved',    count(*) FILTER (WHERE "status" = 'RESOLVED'),
    'closed',      count(*) FILTER (WHERE "status" = 'CLOSED'),
    'unassigned',  count(*) FILTER (WHERE "assigneeId" IS NULL AND "status" IN ('OPEN', 'IN_PROGRESS')),
    'overdue',     count(*) FILTER (WHERE "dueAt" < now() AND "status" IN ('OPEN', 'IN_PROGRESS')),
    'needsReply',  count(*) FILTER (WHERE "staffUnread" AND "status" IN ('OPEN', 'IN_PROGRESS')),
    'createdToday',  count(*) FILTER (WHERE "createdAt" >= date_trunc('day', now())),
    'resolvedToday', count(*) FILTER (WHERE "resolvedAt" >= date_trunc('day', now())),
    'avgFirstResponseMinutes', (
      SELECT round(avg(extract(epoch FROM ("firstResponseAt" - "createdAt")) / 60))::int
      FROM ops."SupportTicket" WHERE "firstResponseAt" IS NOT NULL AND "createdAt" >= now() - interval '30 days'
    ),
    'csat', (SELECT round(avg("rating")::numeric, 1) FROM ops."SupportTicket" WHERE "rating" IS NOT NULL AND "createdAt" >= now() - interval '90 days'),
    'csatCount', (SELECT count(*) FROM ops."SupportTicket" WHERE "rating" IS NOT NULL AND "createdAt" >= now() - interval '90 days')
  )
  FROM ops."SupportTicket";
$$;

-- "Was this helpful?" on a help article. supabase-js cannot increment, so it is a function.
CREATE OR REPLACE FUNCTION vote_faq(p_id TEXT, p_helpful BOOLEAN)
RETURNS void LANGUAGE sql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
  UPDATE ops."Faq" SET
    "helpfulYes" = "helpfulYes" + CASE WHEN p_helpful THEN 1 ELSE 0 END,
    "helpfulNo"  = "helpfulNo"  + CASE WHEN p_helpful THEN 0 ELSE 1 END
  WHERE "id" = p_id AND "isPublished";
$$;

REVOKE ALL ON FUNCTION support_sla_hours(ops."TicketPriority") FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_support_ticket(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION add_support_message(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION auto_close_support_tickets(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION support_stats() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION vote_faq(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION support_sla_hours(ops."TicketPriority") TO service_role;
GRANT EXECUTE ON FUNCTION create_support_ticket(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION add_support_message(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION auto_close_support_tickets(INT) TO service_role;
GRANT EXECUTE ON FUNCTION support_stats() TO service_role;
GRANT EXECUTE ON FUNCTION vote_faq(TEXT, BOOLEAN) TO service_role;

-- ============================================================================
-- Security: only the API (service_role) can read or write these tables.
-- ============================================================================

ALTER TABLE ops."SupportTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops."SupportMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops."Faq" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops."CannedReply" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ops."SupportTicket", ops."SupportMessage", ops."Faq", ops."CannedReply" FROM anon, authenticated;
REVOKE ALL ON SEQUENCE ops."SupportTicket_number_seq" FROM anon, authenticated;
GRANT ALL ON TABLE ops."SupportTicket", ops."SupportMessage", ops."Faq", ops."CannedReply" TO service_role;
GRANT ALL ON SEQUENCE ops."SupportTicket_number_seq" TO service_role;

-- ============================================================================
-- Storage: photos customers attach to a ticket (damaged pouch, wrong item).
-- Public bucket, random file names, 5 MB each, JPG/PNG/WebP only.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('support-attachments', 'support-attachments', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
    ON CONFLICT (id) DO UPDATE
      SET public = true,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
