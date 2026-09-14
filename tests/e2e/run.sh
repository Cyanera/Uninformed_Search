#!/bin/bash
cd /home/user/Uninformed_Search
fuser -k 8811/tcp 3000/tcp 2>/dev/null; sleep 1
/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/pge2e/data -w stop >/dev/null 2>&1
bash tests/e2e/setup-db.sh

export FAKE_DB_URL="postgresql://postgres@127.0.0.1:5440/postgres"
export FAKE_PORT=8811
node tests/e2e/fake-supabase.mjs > /tmp/fake.log 2>&1 &
sleep 2

export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8811
export NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_faketestkey
export SUPABASE_SERVICE_ROLE_KEY=sb_secret_faketestkey
export SUPABASE_DB_URL="postgresql://postgres@127.0.0.1:5440/postgres"

if [ "$1" != "--no-build" ]; then
  npm run build > /tmp/build.log 2>&1 && echo "build ok" || { tail -20 /tmp/build.log; exit 1; }
fi
npm run start > /tmp/app.log 2>&1 &
sleep 7
node tests/e2e/run.mjs
