import { createAdminClient } from "@/lib/supabase/admin";
import { cleanText, fail, ok, readJson } from "@/lib/api";
import { MIGRATION_SQL, SEED_SQL } from "@/lib/setup/schema.generated";
import { isTransactionPooler, pgOptions } from "@/lib/setup/connection";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * First-run setup, performed by the deployed app on its own database.
 *
 * The instance already holds the service-role key and, on a Vercel + Supabase
 * deployment, a Postgres connection string. That is everything needed to create
 * the schema and the first instructor account, so the person running the class
 * never has to open a terminal or paste SQL anywhere.
 *
 * The whole endpoint is gated on there being NO instructor account yet. Once
 * the first one exists it refuses everything, so it cannot be used later to
 * mint accounts on a live classroom.
 */

const TEMPLATE_ID = "00000000-0000-4000-8000-000000000001";

function projectUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
}

function serviceKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

/**
 * A direct (non-pooled) connection. The Vercel Supabase integration injects
 * these; the transaction pooler cannot run a multi-statement DDL script, so it
 * is never used here.
 */
function databaseUrl(): string | null {
  const candidates = [
    process.env.SUPABASE_DB_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
  ].filter((value): value is string => !!value);

  const usable = candidates.find((value) => !isTransactionPooler(value));
  return usable ?? null;
}

function headers(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function countInstructors(url: string, key: string): Promise<number | null> {
  try {
    const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=200`, { headers: headers(key) });
    if (!res.ok) return null;
    const body = (await res.json()) as { users?: unknown[] };
    return (body.users ?? []).length;
  } catch {
    return null;
  }
}

async function schemaReady(): Promise<boolean> {
  try {
    const { error } = await createAdminClient().from("sessions").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function templateReady(): Promise<boolean> {
  try {
    const { data } = await createAdminClient()
      .from("state_space_problems")
      .select("id")
      .eq("id", TEMPLATE_ID)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/** Reports what still needs doing, so the page can show real state. */
export async function GET() {
  const url = projectUrl();
  const key = serviceKey();

  if (!url || !key) {
    return ok({
      configured: false,
      schemaReady: false,
      instructorCount: null,
      canRunMigration: false,
      completed: false,
    });
  }

  const [ready, instructors] = await Promise.all([schemaReady(), countInstructors(url, key)]);

  return ok({
    configured: true,
    schemaReady: ready,
    seedReady: ready ? await templateReady() : false,
    instructorCount: instructors,
    canRunMigration: !!databaseUrl(),
    completed: ready && !!instructors && instructors > 0,
  });
}

export async function POST(request: Request) {
  const url = projectUrl();
  const key = serviceKey();

  if (!url || !key) {
    return fail(
      "This deployment has no Supabase credentials. Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY to the environment and redeploy.",
      503,
    );
  }

  const instructors = await countInstructors(url, key);
  if (instructors === null) {
    return fail("Could not reach Supabase with the configured service-role key.", 502);
  }
  // The first-run gate. Everything below is refused once an account exists.
  if (instructors > 0) {
    return fail("This app has already been set up. Sign in instead.", 409);
  }

  const body = await readJson<{ email?: string; password?: string }>(request);
  const email = cleanText(body?.email, 160).toLowerCase();
  const password = typeof body?.password === "string" ? body.password : "";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Enter a valid email address.");
  if (password.length < 8) return fail("Use a password of at least 8 characters.");

  const steps: string[] = [];

  /* --------------------------------------------------------- the schema */
  if (!(await schemaReady())) {
    const dbUrl = databaseUrl();
    if (!dbUrl) {
      return fail(
        "The database tables do not exist yet, and this deployment has no direct Postgres connection to create them. Add SUPABASE_DB_URL (Supabase > Project Settings > Database > Connection string, port 5432) and redeploy, or run supabase/migrations/0001_init.sql and supabase/seed.sql in the Supabase SQL Editor.",
        503,
      );
    }

    const { Client } = await import("pg");
    const client = new Client(pgOptions(dbUrl));

    try {
      await client.connect();
      await client.query(MIGRATION_SQL);
      steps.push("Created the database tables and security policies.");
      await client.query(SEED_SQL);
      steps.push("Added the Campus Delivery Robot problem.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(`Could not create the database tables: ${message}`, 500);
    } finally {
      await client.end().catch(() => {});
    }
  } else {
    steps.push("Database tables were already in place.");
    if (!(await templateReady())) {
      const dbUrl = databaseUrl();
      if (dbUrl) {
        const { Client } = await import("pg");
        const client = new Client(pgOptions(dbUrl));
        try {
          await client.connect();
          await client.query(SEED_SQL);
          steps.push("Added the Campus Delivery Robot problem.");
        } catch {
          // Not fatal: the built-in problem is also available in code.
        } finally {
          await client.end().catch(() => {});
        }
      }
    }
  }

  /* ----------------------------------------------------- the instructor */
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: headers(key),
    // Confirmed immediately: nobody should be waiting on an email minutes
    // before a lecture.
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  if (!res.ok) {
    return fail(`The database is ready, but the account could not be created: ${await res.text()}`, 500);
  }
  steps.push(`Created your instructor account (${email}), already confirmed.`);

  return ok({ completed: true, steps, email });
}
