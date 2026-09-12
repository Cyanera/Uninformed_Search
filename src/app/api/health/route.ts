import { ok } from "@/lib/api";
import { resolveSupabaseUrlDetailed } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

/**
 * Diagnostics for a deployment, safe to open in a browser and paste to someone
 * for help.
 *
 * It reports which build is actually live, whether each value is present and
 * of the right SHAPE, and what the database says — but never a key itself.
 * Lengths and prefixes are enough to identify every mistake that matters and
 * are useless to anyone who reads them.
 */

interface KeyReport {
  present: boolean;
  length?: number;
  prefix?: string;
  looksRight?: boolean;
  note?: string;
}

function describeKey(value: string | undefined, kind: "public" | "secret"): KeyReport {
  if (!value) return { present: false, note: "Not set." };

  const prefix = value.slice(0, 14);
  const isNewPublic = value.startsWith("sb_publishable_");
  const isNewSecret = value.startsWith("sb_secret_");
  const isLegacyJwt = value.startsWith("eyJ");

  if (kind === "public") {
    if (isNewSecret) {
      return { present: true, length: value.length, prefix, looksRight: false, note: "This is a SECRET key in the public slot. Swap them." };
    }
    return {
      present: true,
      length: value.length,
      prefix,
      looksRight: isNewPublic || isLegacyJwt,
      note: isNewPublic || isLegacyJwt ? undefined : "Does not look like a Supabase publishable/anon key.",
    };
  }

  if (isNewPublic) {
    return { present: true, length: value.length, prefix, looksRight: false, note: "This is the PUBLIC key in the secret slot. Swap them." };
  }
  return {
    present: true,
    length: value.length,
    prefix,
    looksRight: isNewSecret || isLegacyJwt,
    note: isNewSecret || isLegacyJwt ? undefined : "Does not look like a Supabase secret/service_role key.",
  };
}

function describeUrl(value: string | undefined) {
  const resolved = resolveSupabaseUrlDetailed(value);
  return {
    present: !!value,
    // The URL is public anyway - it is in every student's browser.
    given: value ? value.slice(0, 80) : undefined,
    resolvedTo: resolved.url ?? undefined,
    looksRight: !!resolved.url,
    repaired: resolved.repaired ?? undefined,
    note: resolved.note,
  };
}

export async function GET() {
  // Describe what was actually set, but probe with what it resolves to.
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const url = resolveSupabaseUrlDetailed(rawUrl).url ?? undefined;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: describeUrl(rawUrl),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: describeKey(anon, "public"),
    SUPABASE_SERVICE_ROLE_KEY: describeKey(secret, "secret"),
    SUPABASE_DB_URL: {
      present: !!process.env.SUPABASE_DB_URL,
      note: process.env.SUPABASE_DB_URL
        ? /:6543\//.test(process.env.SUPABASE_DB_URL)
          ? "Uses port 6543 (transaction pooler); migrations need port 5432."
          : undefined
        : "Optional. Without it the setup page shows SQL for you to paste instead.",
    },
  };

  const sameKey = !!anon && anon === secret;

  const supabase: Record<string, unknown> = {
    reachable: null,
    serviceKeyAccepted: null,
    schemaReady: null,
    instructorAccounts: null,
  };

  if (url && secret && env.NEXT_PUBLIC_SUPABASE_URL.looksRight) {
    const headers = { apikey: secret, Authorization: `Bearer ${secret}` };
    try {
      const probe = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, { headers });
      supabase.reachable = true;
      supabase.serviceKeyAccepted = probe.status !== 401 && probe.status !== 403;

      const tables = await fetch(`${url.replace(/\/$/, "")}/rest/v1/sessions?select=id&limit=1`, { headers });
      supabase.schemaReady = tables.status !== 404;

      const users = await fetch(`${url.replace(/\/$/, "")}/auth/v1/admin/users?page=1&per_page=1`, { headers });
      if (users.ok) {
        const body = (await users.json()) as { users?: unknown[]; total?: number };
        supabase.instructorAccounts = body.total ?? (body.users ?? []).length;
      }
    } catch {
      supabase.reachable = false;
    }
  }

  const problems: string[] = [];
  if (sameKey) problems.push("The public and secret keys are identical. One of them is pasted in the wrong place.");
  for (const [name, report] of Object.entries(env)) {
    const r = report as { looksRight?: boolean; note?: string; present: boolean };
    if (r.note && r.looksRight === false) problems.push(`${name}: ${r.note}`);
  }
  if (supabase.reachable === false) problems.push("Could not reach the Supabase project at that URL.");
  if (supabase.serviceKeyAccepted === false) problems.push("Supabase rejected the secret key.");

  let nextAction: string;
  if (problems.length) nextAction = "Fix the problems listed above in your hosting environment variables, then redeploy.";
  else if (supabase.schemaReady === false) nextAction = "Open /instructor/setup — it will give you the SQL to create the tables.";
  else if (!supabase.instructorAccounts) nextAction = "Open /instructor/setup to create your instructor account.";
  else nextAction = "Everything is set up. Sign in at /instructor.";

  return ok({
    ok: problems.length === 0,
    build: {
      // Proves WHICH version is live - the usual reason a fix appears not to work.
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "unknown (not on Vercel)",
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      // This build ships no middleware at all; if a deployment still fails with
      // MIDDLEWARE_INVOCATION_FAILED it is serving an older build.
      hasMiddleware: false,
    },
    env,
    supabase,
    problems,
    nextAction,
  });
}
