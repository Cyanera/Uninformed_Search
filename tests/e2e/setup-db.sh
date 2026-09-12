#!/bin/bash
# Boots a throwaway PostgreSQL with the auth schema Supabase provides.
set -e
PGROOT=${PGROOT:-/var/lib/pge2e}
PGBIN=/usr/lib/postgresql/16/bin
# Stop anything left from a previous run before reclaiming the directory.
if [ -d "$PGROOT/data" ]; then
  su ubuntu -c "$PGBIN/pg_ctl -D $PGROOT/data -m immediate -w stop" >/dev/null 2>&1 || true
fi
fuser -k 5440/tcp >/dev/null 2>&1 || true
sleep 1
rm -rf "$PGROOT"; mkdir -p "$PGROOT"; chown ubuntu:ubuntu "$PGROOT"
su ubuntu -c "$PGBIN/initdb -D $PGROOT/data -U postgres --auth=trust" >/dev/null 2>&1
su ubuntu -c "$PGBIN/pg_ctl -D $PGROOT/data -o '-p 5440 -k $PGROOT -c listen_addresses=127.0.0.1' -l $PGROOT/log -w start" >/dev/null
cat > "$PGROOT/pre.sql" <<'SQL'
create extension if not exists "pgcrypto";
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role anon; create role authenticated; create role service_role bypassrls;
SQL
chmod +r "$PGROOT/pre.sql"
su ubuntu -c "$PGBIN/psql -h 127.0.0.1 -p 5440 -U postgres -q -v ON_ERROR_STOP=1 -f $PGROOT/pre.sql"
echo "postgres ready on 5440"
