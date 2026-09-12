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
export function assertProjectUrl(value: string): string {
  const url = value.trim().replace(/\/+$/, "");

  const dashboard = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9]{16,})/i);
  if (dashboard) {
    console.error(`
${colors.bad("That is the dashboard URL, not the project API URL.")}

  You pasted:  ${url}
  You want:    ${colors.bold(`https://${dashboard[1]}.supabase.co`)}

  Put that second line in .env.local as NEXT_PUBLIC_SUPABASE_URL and re-run.
`);
    process.exit(1);
  }

  // A bare project ref is unambiguous, so accept it rather than being pedantic.
  if (/^[a-z0-9]{16,}$/i.test(url)) return `https://${url}.supabase.co`;

  if (!/^https?:\/\//i.test(url)) {
    console.error(`
${colors.bad("NEXT_PUBLIC_SUPABASE_URL does not look like a URL.")}

  You pasted:  ${url}
  Expected:    https://<your-project-ref>.supabase.co
`);
    process.exit(1);
  }

  return url;
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
