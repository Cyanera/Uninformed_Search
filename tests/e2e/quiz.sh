cd /home/user/Uninformed_Search
fuser -k 8811/tcp 3000/tcp 2>/dev/null; sleep 1
/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/pge2e/data -m immediate -w stop >/dev/null 2>&1
bash tests/e2e/setup-db.sh >/dev/null
export FAKE_DB_URL="postgresql://postgres@127.0.0.1:5440/postgres" FAKE_PORT=8811
node tests/e2e/fake-supabase.mjs > /tmp/fake.log 2>&1 &
sleep 2
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8811 \
       NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_fake \
       SUPABASE_SERVICE_ROLE_KEY=sb_secret_fake \
       SUPABASE_DB_URL="postgresql://postgres@127.0.0.1:5440/postgres"
# NEXT_PUBLIC_* are inlined at BUILD time, so the build must see them.
npm run build > /tmp/build.log 2>&1 && echo "build ok" || { tail -15 /tmp/build.log; exit 1; }
npm run start > /tmp/app.log 2>&1 &
sleep 7
node tests/e2e/quiz.mjs
