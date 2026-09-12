/**
 * One-command setup.
 *
 * Does everything that can be done without a human: applies the schema, seeds
 * the default problem, and creates a confirmed instructor account. Creating the
 * Supabase project itself is the only step that needs you, because it needs
 * your account.
 *
 *   npm run setup
 *
 * Reads from .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL     required
 *   SUPABASE_SERVICE_ROLE_KEY    required
 *   SUPABASE_DB_URL              optional - lets this script apply the SQL itself
 *   INSTRUCTOR_EMAIL             optional - instructor account to create
 *   INSTRUCTOR_PASSWORD          optional
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  authUrl,
  colors,
  loadEnv,
  note,
  required,
  restUrl,
  serviceHeaders,
  step,
  tick,
  warn,
} from "./env";

loadEnv();

const TOTAL = 4;
const projectUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const dbUrl = process.env.SUPABASE_DB_URL;
const headers = serviceHeaders(serviceKey);

const TEMPLATE_ID = "00000000-0000-4000-8000-000000000001";

async function schemaExists(): Promise<boolean> {
  const res = await fetch(restUrl(projectUrl, "sessions?select=id&limit=1"), { headers });
  return res.status !== 404;
}

async function templateSeeded(): Promise<boolean> {
  const res = await fetch(restUrl(projectUrl, `state_space_problems?select=id&id=eq.${TEMPLATE_ID}`), {
    headers,
  });
  if (!res.ok) return false;
  return ((await res.json()) as unknown[]).length > 0;
}

async function applySqlDirectly(): Promise<boolean> {
  if (!dbUrl) return false;
  const { Client } = await import("pg");
  // Supabase requires TLS; a local Postgres usually has none, and forcing it
  // there fails the connection outright.
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(dbUrl) || /sslmode=disable/.test(dbUrl);
  const client = new Client({
    connectionString: dbUrl,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    for (const file of ["supabase/migrations/0001_init.sql", "supabase/seed.sql"]) {
      const sql = readFileSync(resolve(process.cwd(), file), "utf8");
      await client.query(sql);
      tick(`applied ${file}`);
    }
    return true;
  } finally {
    await client.end();
  }
}

function printManualSqlInstructions(): void {
  console.log(`
  ${colors.bold("The schema is not in place yet.")} Two ways to fix that:

  ${colors.bold("A.")} Let this script do it. Supabase > Project Settings > Database >
     Connection string > URI. Add it to .env.local as one line, then re-run
     ${colors.bold("npm run setup")}:

       SUPABASE_DB_URL=postgresql://postgres:YOUR-PASSWORD@db.xxxx.supabase.co:5432/postgres

  ${colors.bold("B.")} Or paste it yourself. Supabase > SQL Editor, run these two files in order:

       supabase/migrations/0001_init.sql
       supabase/seed.sql
`);
}

async function findUser(email: string): Promise<{ id: string } | null> {
  const res = await fetch(
    authUrl(projectUrl, `admin/users?page=1&per_page=200`),
    { headers },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { users?: { id: string; email?: string }[] };
  const match = (body.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return match ? { id: match.id } : null;
}

async function createInstructor(email: string, password: string): Promise<void> {
  const existing = await findUser(email);
  if (existing) {
    tick(`instructor account already exists: ${email}`);
    return;
  }

  const res = await fetch(authUrl(projectUrl, "admin/users"), {
    method: "POST",
    headers,
    // email_confirm skips the confirmation mail, which nobody wants ten minutes
    // before a lecture starts.
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  if (!res.ok) {
    const body = await res.text();
    warn(`could not create the instructor account: ${body}`);
    note("Create one yourself at /instructor/login, or in Supabase > Authentication > Users.");
    return;
  }
  tick(`instructor account created and confirmed: ${email}`);
}

async function main(): Promise<void> {
  console.log(colors.bold("\nUninformed Search - setup\n"));
  note(`project: ${projectUrl}`);

  step(1, TOTAL, "Checking the connection");
  const probe = await fetch(restUrl(projectUrl, ""), { headers });
  if (probe.status === 401 || probe.status === 403) {
    console.error(
      `\n${colors.bad("The service role key was rejected.")} Check SUPABASE_SERVICE_ROLE_KEY in .env.local.\n`,
    );
    process.exit(1);
  }
  tick("Supabase reachable, service role key accepted");

  step(2, TOTAL, "Applying the schema");
  if (await schemaExists()) {
    tick("schema already in place");
    if (dbUrl) {
      // Both files are re-runnable, so bring an older database up to date.
      await applySqlDirectly();
    }
  } else if (dbUrl) {
    await applySqlDirectly();
  } else {
    printManualSqlInstructions();
    process.exit(1);
  }

  step(3, TOTAL, "Seeding the Campus Delivery Robot problem");
  if (await templateSeeded()) {
    tick("default problem is available to instructors");
  } else {
    warn("the default problem is missing - run supabase/seed.sql");
  }

  step(4, TOTAL, "Instructor account");
  const email = process.env.INSTRUCTOR_EMAIL;
  const password = process.env.INSTRUCTOR_PASSWORD;
  if (email && password) {
    if (password.length < 6) {
      warn("INSTRUCTOR_PASSWORD must be at least 6 characters - skipping.");
    } else {
      await createInstructor(email, password);
    }
  } else {
    note("INSTRUCTOR_EMAIL / INSTRUCTOR_PASSWORD not set in .env.local.");
    note("Set them and re-run, or create the account at /instructor/login.");
  }

  console.log(`
${colors.ok(colors.bold("Setup complete."))}

  ${colors.bold("npm run demo")}   populate a finished demo class, so you can see the
                 dashboard, the analytics and Teach Mode with real data
  ${colors.bold("npm run dev")}    start the app at http://localhost:3000
`);
}

main().catch((error) => {
  console.error(`\n${colors.bad("Setup failed:")} ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
