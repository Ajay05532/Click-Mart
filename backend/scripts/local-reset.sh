#!/usr/bin/env bash
# LOCAL DEVELOPMENT ONLY. Recreates the local stand-in for Supabase from scratch:
# empty database, Supabase-style roles, then supabase/schema.sql. Then run `npm run db:seed`.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d db
until docker exec clickmart-db pg_isready -U clickmart >/dev/null 2>&1; do sleep 1; done
docker exec clickmart-db psql -U clickmart -d postgres -q -c 'DROP DATABASE IF EXISTS clickmart WITH (FORCE)' -c 'CREATE DATABASE clickmart'
docker exec -i clickmart-db psql -U clickmart -d clickmart -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'authenticator'; END IF;
END $$;
GRANT anon, authenticated, service_role TO authenticator;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA public, extensions TO anon, authenticated, service_role;
SQL
docker exec -i clickmart-db psql -U clickmart -d clickmart -v ON_ERROR_STOP=1 -q < supabase/schema.sql
docker compose up -d --force-recreate rest gateway
sleep 3
echo "Local database ready. Next: npm run db:seed"
