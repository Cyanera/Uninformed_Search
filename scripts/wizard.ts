/**
 * Interactive first-run wizard.
 *
 * Asks for each value, checks it against the live project before accepting it,
 * and writes .env.local. Nothing is echoed back for secrets, and the file is
 * written owner-only, so credentials never have to travel anywhere except
 * between the dashboard and this terminal.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface, type Interface } from "node:readline";
import { resolve } from "node:path";
import { authUrl, colors, normalizeProjectUrl, restUrl, serviceHeaders } from "./env";

interface MutedInterface extends Interface {
  stdoutMuted?: boolean;

  output?: NodeJS.WritableStream;
  _writeToOutput?: (text: string) => void;
}

/**
 * One readline interface for the whole wizard. Opening and closing one per
 * question ends the input stream after the first answer whenever stdin is not
 * a terminal, which is exactly how this gets scripted and tested.
 */
let rl: MutedInterface | null = null;

/**
 * Lines are buffered rather than read through rl.question(), because a piped
 * stdin delivers every line at once: anything that arrives while no question
 * happens to be pending would simply be dropped.
 */
const queue: string[] = [];
let waiting: ((line: string | null) => void) | null = null;
let closed = false;

function reader(): MutedInterface {
  if (rl) return rl;

  const created = createInterface({
    input: process.stdin,
    output: process.stdout,
    // Terminal mode drives the echo, and therefore the masking. Follow whatever
    // stdin actually is: there is nothing to mask on a pipe.
    terminal: Boolean(process.stdin.isTTY),
  }) as MutedInterface;

  // The prompt is written directly to stdout, so everything reaching this hook
  // is the echo of what is being typed.
  created._writeToOutput = function (text: string) {
    created.output?.write(created.stdoutMuted ? "•" : text);
  };

  const deliver = (line: string | null) => {
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(line);
    } else if (line !== null) {
      queue.push(line);
    }
  };

  created.on("line", deliver);
  created.on("close", () => {
    closed = true;
    deliver(null);
  });

  rl = created;
  return created;
}

function nextLine(): Promise<string | null> {
  if (queue.length) return Promise.resolve(queue.shift() as string);
  if (closed) return Promise.resolve(null);
  return new Promise((resolve) => {
    waiting = resolve;
  });
}

export function closeReader(): void {
  rl?.close();
  rl = null;
}

async function ask(query: string, secret = false): Promise<string> {
  const r = reader();
  process.stdout.write(query);
  r.stdoutMuted = secret;

  const line = await nextLine();

  r.stdoutMuted = false;
  if (secret) process.stdout.write("\n");

  if (line === null) {
    // Ctrl-D or a truncated script: stop rather than loop on empty input.
    console.log(`\n${colors.bad("Input ended before setup finished.")}`);
    process.exit(1);
  }
  return line.trim();
}

/** Keeps asking until the value validates. Empty input skips when allowed. */
async function askUntilValid(
  query: string,
  validate: (value: string) => Promise<string | null> | string | null,
  options: { secret?: boolean; optional?: boolean } = {},
): Promise<string> {
  for (;;) {
    const value = await ask(query, options.secret);
    if (!value && options.optional) return "";
    if (!value) {
      console.log(`  ${colors.bad("Required.")}`);
      continue;
    }
    const problem = await validate(value);
    if (!problem) return value;
    console.log(`  ${colors.bad(problem)}`);
  }
}

export function envLocalPath(): string {
  return resolve(process.cwd(), ".env.local");
}

/** True when .env.local is missing the values the app cannot start without. */
export function needsWizard(): boolean {
  const path = envLocalPath();
  if (!existsSync(path)) return true;
  const text = readFileSync(path, "utf8");
  const has = (key: string) => new RegExp(`^${key}=.+$`, "m").test(text);
  return !has("NEXT_PUBLIC_SUPABASE_URL") || !has("SUPABASE_SERVICE_ROLE_KEY");
}

export interface WizardResult {
  projectUrl: string;
  anonKey: string;
  serviceKey: string;
  dbUrl: string;
  instructorEmail: string;
  instructorPassword: string;
}

export async function runWizard(): Promise<WizardResult> {
  console.log(`
${colors.bold("Let's set up your Supabase connection.")}

  Paste each value when asked. Secrets are not shown as you type and are
  written only to .env.local on this machine.

  ${colors.dim("Everything you need is behind the Connect button at the top of your")}
  ${colors.dim("Supabase project, plus Settings for the secret key.")}
`);

  /* ------------------------------------------------------------ project */
  console.log(colors.bold("\n1. Your project"));
  console.log(
    colors.dim("   Open your project and copy the id out of the address bar:\n") +
      colors.dim("   https://supabase.com/dashboard/project/") +
      colors.bold("THIS-PART"),
  );

  let projectUrl = "";
  await askUntilValid("\n   Project ref or URL: ", (value) => {
    const result = normalizeProjectUrl(value);
    if (!result.ok) return result.message;
    projectUrl = result.url;
    return null;
  });
  console.log(`   ${colors.ok("OK")}  ${projectUrl}`);

  /* --------------------------------------------------------- secret key */
  console.log(colors.bold("\n2. Secret key"));
  console.log(
    colors.dim("   Settings > API Keys > 'Secret key' (sb_secret_...),\n") +
      colors.dim("   or Settings > API > 'service_role' behind the Reveal button."),
  );

  const serviceKey = await askUntilValid(
    "\n   Secret key: ",
    async (value) => {
      try {
        const res = await fetch(restUrl(projectUrl, ""), { headers: serviceHeaders(value) });
        if (res.status === 401 || res.status === 403) {
          return "That key was rejected. Make sure it is the SECRET key, not the publishable one.";
        }
        return null;
      } catch {
        return `Could not reach ${projectUrl}. Check the project ref and your connection.`;
      }
    },
    { secret: true },
  );
  console.log(`   ${colors.ok("OK")}  key accepted by ${projectUrl}`);

  /* ----------------------------------------------------------- anon key */
  console.log(colors.bold("\n3. Publishable key"));
  console.log(
    colors.dim("   The PUBLIC one: 'Publishable key' (sb_publishable_...) or 'anon public'.\n") +
      colors.dim("   The Connect button shows it as NEXT_PUBLIC_SUPABASE_ANON_KEY."),
  );

  const anonKey = await askUntilValid("\n   Publishable key: ", (value) => {
    if (value === serviceKey) return "That is the same as the secret key. The publishable key is a different value.";
    if (/^sb_secret_/i.test(value)) return "That is a secret key. Paste the publishable one.";
    return null;
  });
  console.log(`   ${colors.ok("OK")}`);

  /* --------------------------------------------------------- connection */
  console.log(colors.bold("\n4. Database connection string"));
  console.log(
    colors.dim("   Settings > Database > Connection string > URI, or the Connect button.\n") +
      colors.dim("   Use port 5432. Press Enter to skip and paste the SQL yourself instead."),
  );

  let dbUrl = await askUntilValid(
    "\n   Connection string (optional): ",
    (value) => {
      if (!/^postgres(ql)?:\/\//i.test(value)) return "That should start with postgresql://";
      if (/:6543\//.test(value)) {
        return "That is the transaction pooler (port 6543), which cannot run migrations. Use port 5432.";
      }
      return null;
    },
    { optional: true },
  );

  if (dbUrl.includes("[YOUR-PASSWORD]")) {
    console.log(colors.dim("\n   That string still has the [YOUR-PASSWORD] placeholder in it."));
    console.log(colors.dim("   Enter the database password you chose when creating the project."));
    const password = await askUntilValid("\n   Database password: ", (v) => (v ? null : "Required."), {
      secret: true,
    });
    dbUrl = dbUrl.replace("[YOUR-PASSWORD]", encodeURIComponent(password));
    console.log(`   ${colors.ok("OK")}  password inserted`);
  }

  /* -------------------------------------------------------- instructor */
  console.log(colors.bold("\n5. Your instructor login"));
  console.log(colors.dim("   Created for you, already confirmed, so there is no email to wait for."));

  const instructorEmail = await askUntilValid(
    "\n   Email: ",
    (value) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? null : "That does not look like an email address."),
    { optional: true },
  );

  let instructorPassword = "";
  if (instructorEmail) {
    instructorPassword = await askUntilValid(
      "   Password (min 6 characters): ",
      (value) => (value.length >= 6 ? null : "Too short - at least 6 characters."),
      { secret: true },
    );
  }

  closeReader();
  return { projectUrl, anonKey, serviceKey, dbUrl, instructorEmail, instructorPassword };
}

/** Writes .env.local, owner-readable only, preserving any unrelated keys. */
export function writeEnvLocal(result: WizardResult): string {
  const path = envLocalPath();
  const lines = [
    "# Written by `npm run setup`. Never commit this file.",
    `NEXT_PUBLIC_SUPABASE_URL=${result.projectUrl}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${result.anonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${result.serviceKey}`,
    `SUPABASE_DB_URL=${result.dbUrl}`,
    `INSTRUCTOR_EMAIL=${result.instructorEmail}`,
    `INSTRUCTOR_PASSWORD=${result.instructorPassword}`,
    "",
  ];

  writeFileSync(path, lines.join("\n"), { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows has no POSIX modes; the file is still outside version control.
  }
  return path;
}

/** Confirms the Auth admin API is usable before promising an account. */
export async function authAdminReachable(projectUrl: string, serviceKey: string): Promise<boolean> {
  try {
    const res = await fetch(authUrl(projectUrl, "admin/users?page=1&per_page=1"), {
      headers: serviceHeaders(serviceKey),
    });
    return res.ok;
  } catch {
    return false;
  }
}
