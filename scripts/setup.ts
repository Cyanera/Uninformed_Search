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
  assertProjectUrl,
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
const projectUrl = assertProjectUrl(required("NEXT_PUBLIC_SUPABASE_URL"));
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

/**
 * Turns the two connection problems everybody actually hits into instructions
 * rather than a stack trace.
 */
function explainConnectionFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/ENETUNREACH|EHOSTUNREACH|ETIMEDOUT/i.test(message)) {
    return `${message}

  The host resolved but could not be reached. Supabase's "Direct connection" is
  IPv6-only unless you have the IPv4 add-on, and many home and campus networks
  have no IPv6 route.

  Fix: Supabase > Project Settings > Database > Connection string, choose
  ${colors.bold("Session pooler")} (port 5432) instead, and put that URI in SUPABASE_DB_URL.`;
  }

  if (/ENOTFOUND/i.test(message)) {
    return `${message}

  That database hostname does not exist. Copy the URI again from
  Supabase > Project Settings > Database > Connection string, and check you
  did not paste the project URL by mistake - the two are different hosts.`;
  }

  if (/password authentication failed|SASL|SCRAM/i.test(message)) {
    return `${message}

  The database password in SUPABASE_DB_URL is wrong. It is the password you set
  when you created the project, not any of the API keys, and the copied URI
  contains the literal placeholder [YOUR-PASSWORD] until you replace it.

  Forgotten it? Supabase > Project Settings > Database > Reset database password.`;
  }

  return message;
}

async function applySqlDirectly(): Promise<boolean> {
  if (!dbUrl) return false;

  if (dbUrl.includes("[YOUR-PASSWORD]")) {
    throw new Error(
      "SUPABASE_DB_URL still contains the literal [YOUR-PASSWORD] placeholder. Replace it with your database password.",
    );
  }

  // The transaction pooler multiplexes statements across connections, which
  // breaks a multi-statement DDL script. Migrations need 5432, not 6543.
  if (/:6543\//.test(dbUrl)) {
    warn("SUPABASE_DB_URL points at the transaction pooler (port 6543), which cannot run migrations.");
    note("Use the Direct connection or the Session pooler - both on port 5432 - and re-run.");
    throw new Error("Wrong connection string for applying a schema.");
  }

  const { Client } = await import("pg");
  // Supabase requires TLS; a local Postgres usually has none, and forcing it
  // there fails the connection outright.
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(dbUrl) || /sslmode=disable/.test(dbUrl);
  const client = new Client({
    connectionString: dbUrl,
    ssl: local ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });

  try {
    await client.connect();
  } catch (error) {
    throw new Error(explainConnectionFailure(error));
  }

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
  let probe: Response;
  try {
    probe = await fetch(restUrl(projectUrl, ""), { headers });
  } catch {
    // A bare "fetch failed" helps nobody; name the two things it can be.
    console.error(`
${colors.bad("Could not reach")} ${projectUrl}

  Either NEXT_PUBLIC_SUPABASE_URL is wrong, or this machine is offline.

  The dashboard moves this setting around, so the reliable way to find it is
  your browser's address bar. Open your project and look at:

      https://supabase.com/dashboard/project/${colors.bold("<this-part>")}

  Your API URL is always https://${colors.bold("<this-part>")}.supabase.co
  Pasting just <this-part> here works too.
`);
    process.exit(1);
  }

  if (probe.status === 401 || probe.status === 403) {
    console.error(`
${colors.bad("The service role key was rejected.")}

  Check SUPABASE_SERVICE_ROLE_KEY in .env.local. It is the SECRET key on
  Project Settings > API - "Secret key" (sb_secret_...) on newer projects, or
  "service_role" behind the Reveal button on older ones. It is not the
  publishable/anon key.
`);
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
