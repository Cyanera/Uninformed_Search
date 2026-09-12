import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Reads .env.local without a dependency, then lets real environment variables
 * win. Keeps the setup scripts usable both locally and in CI.
 */
export function loadEnv(file = ".env.local"): void {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const ESC = String.fromCharCode(27);
const c = (code: string) => (s: string) => `${ESC}[${code}m${s}${ESC}[0m`;

export const colors = {
  ok: c("32"),
  warn: c("33"),
  bad: c("31"),
  dim: c("2"),
  bold: c("1"),
};

export function required(name: string, hint?: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`\n${colors.bad("Missing")} ${name}`);
    console.error(
      hint ?? "  Copy .env.example to .env.local and fill it in from Supabase > Project Settings > API.\n",
    );
    process.exit(1);
  }
  return value;
}

/**
 * The first thing that can fail on a fresh machine is the Node version, and
 * the resulting error is always something unrelated-looking. Check it up front.
 */
export function requireNodeVersion(minimum = 20): void {
  const major = Number(process.versions.node.split(".")[0]);
  if (Number.isFinite(major) && major < minimum) {
    console.error(`
${colors.bad(`Node ${minimum} or newer is required.`)}  You are running Node ${process.versions.node}.

  On macOS:   brew install node
  Or install the LTS build from https://nodejs.org
`);
    process.exit(1);
  }
}

export function step(n: number, total: number, text: string): void {
  console.log(`\n${colors.bold(`[${n}/${total}]`)} ${text}`);
}

export function tick(text: string): void {
  console.log(`  ${colors.ok("OK")}  ${text}`);
}

export function note(text: string): void {
  console.log(`  ${colors.dim(text)}`);
}

export function warn(text: string): void {
  console.log(`  ${colors.warn("!")}   ${text}`);
}

/**
 * The Supabase dashboard moves things around, and the URL people reach for
 * first is the one in their address bar - which is the dashboard, not the API.
 * Catch that here and say exactly what to paste, so .env.local ends up correct
 * for the app too rather than only for this script.
 */
export type UrlResult = { ok: true; url: string } | { ok: false; message: string };

export function normalizeProjectUrl(value: string): UrlResult {
  const url = value.trim().replace(/\/+$/, "");
  if (!url) return { ok: false, message: "Nothing entered." };

  // The likeliest mistake: pasting the URL that is already in the address bar.
  const dashboard = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9]{16,})/i);
  if (dashboard) {
    return {
      ok: true,
      url: `https://${dashboard[1]}.supabase.co`,
    };
  }

  // A bare project ref is unambiguous, so accept it rather than being pedantic.
  if (/^[a-z0-9]{16,}$/i.test(url)) return { ok: true, url: `https://${url}.supabase.co` };

  if (/^https:\/\/[a-z0-9]{16,}\.supabase\.(co|in)$/i.test(url)) return { ok: true, url };

  if (!/^https?:\/\//i.test(url)) {
    return {
      ok: false,
      message: `That does not look like a URL or a project ref.\n  Expected something like https://abcdefghijklmnop.supabase.co`,
    };
  }

  // A self-hosted or custom domain: trust it.
  return { ok: true, url };
}

export function assertProjectUrl(value: string): string {
  const result = normalizeProjectUrl(value);
  if (!result.ok) {
    console.error(`\n${colors.bad("NEXT_PUBLIC_SUPABASE_URL is not usable.")}\n  ${result.message}\n`);
    process.exit(1);
  }
  if (result.url !== value.trim().replace(/\/+$/, "")) {
    note(`using ${result.url}`);
  }
  return result.url;
}

/** Supabase REST base for a project URL. */
export function restUrl(projectUrl: string, path: string): string {
  return `${projectUrl.replace(/\/$/, "")}/rest/v1/${path}`;
}

export function authUrl(projectUrl: string, path: string): string {
  return `${projectUrl.replace(/\/$/, "")}/auth/v1/${path}`;
}

export function serviceHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}
