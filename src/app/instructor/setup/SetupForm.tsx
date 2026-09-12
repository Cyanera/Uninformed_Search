"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Field, Input, Notice, Spinner } from "@/components/ui";

interface Status {
  configured: boolean;
  schemaReady: boolean;
  seedReady?: boolean;
  instructorCount: number | null;
  canRunMigration: boolean;
  completed: boolean;
}

export function SetupForm() {
  const [status, setStatus] = useState<Status | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[] | null>(null);

  const recheck = useCallback(() => {
    setStatus(null);
    fetch("/api/instructor/bootstrap", { cache: "no-store" })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    recheck();
  }, [recheck]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/instructor/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Setup failed.");
      setSteps(data.steps ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <div className="mt-8">
        <Spinner label="Checking this deployment…" />
      </div>
    );
  }

  if (steps) {
    return (
      <div className="mt-8 space-y-4">
        <Notice tone="goal" title="Setup complete">
          <ul className="mt-2 space-y-1">
            {steps.map((s) => (
              <li key={s}>· {s}</li>
            ))}
          </ul>
        </Notice>
        <Link
          href="/instructor/login"
          className="inline-flex min-h-[52px] items-center rounded border border-accent bg-accent px-5 font-semibold text-white hover:bg-[#1A43BE]"
        >
          Sign in and create your first session →
        </Link>
      </div>
    );
  }

  if (!status.configured) {
    return (
      <Notice tone="warn" title="This deployment has no database yet">
        <p className="mt-1 leading-relaxed">
          Add a Supabase project to it, then reload this page. In Vercel: <strong>Storage</strong> or{" "}
          <strong>Integrations</strong> → add <strong>Supabase</strong>, which creates the database and fills
          in the keys for you. Redeploy afterwards so the new values are picked up.
        </p>
      </Notice>
    );
  }

  if (status.completed) {
    return (
      <div className="mt-8 space-y-4">
        <Notice tone="accent" title="Already set up">
          This app has a database and an instructor account, so setup is closed.
        </Notice>
        <Link href="/instructor/login" className="text-accent underline-offset-2 hover:underline">
          Go to sign in →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <ul className="space-y-1.5 rounded border border-line bg-canvas p-3 text-sm">
        <li>
          {status.schemaReady ? "✓" : "•"} Database tables{" "}
          <span className="text-ink-muted">
            {status.schemaReady
              ? "already created"
              : status.canRunMigration
                ? "will be created now"
                : "cannot be created automatically"}
          </span>
        </li>
        <li>
          {status.instructorCount ? "✓" : "•"} Instructor account{" "}
          <span className="text-ink-muted">
            {status.instructorCount ? "exists" : "will be created below"}
          </span>
        </li>
      </ul>

      {!status.schemaReady && !status.canRunMigration && <ManualSql onRecheck={recheck} />}

      <Field label="Your email" htmlFor="email" hint="This becomes your instructor sign-in.">
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </Field>

      <Field label="Choose a password" htmlFor="password" hint="At least 8 characters.">
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      {error && <Notice tone="warn">{error}</Notice>}

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
        {busy ? "Setting up…" : "Set up and create my account"}
      </Button>

      <p className="text-xs leading-relaxed text-ink-muted">
        This page works only until the first account exists. After that it refuses everything, so it cannot
        be used to create accounts on a live classroom.
      </p>
    </form>
  );
}

/**
 * Shown when the app cannot create its own tables. Rather than sending the
 * instructor off to find two files in a repository and redeploy, the SQL is
 * served by this deployment and offered with a copy button.
 */
function ManualSql({ onRecheck }: { onRecheck: () => void }) {
  const [sql, setSql] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/instructor/bootstrap/sql")
      .then((r) => r.text())
      .then(setSql)
      .catch(() => setSql(null));
  }, []);

  async function copy() {
    if (!sql) return;
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked: the textarea below is still selectable by hand.
    }
  }

  return (
    <div className="space-y-3 rounded border border-warn-line bg-warn-soft p-3">
      <div>
        <p className="text-sm font-semibold text-warn">One step to do by hand</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          This deployment has no direct database connection, so it cannot create the tables itself. Copy
          the SQL below, paste it into the Supabase <strong>SQL Editor</strong>, and press Run. It takes a
          few seconds and is safe to run more than once.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={copy} disabled={!sql}>
          {copied ? "Copied" : "Copy the SQL"}
        </Button>
        <a
          href="https://supabase.com/dashboard/project/_/sql/new"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-paper px-3 text-sm font-medium hover:bg-canvas"
        >
          Open the Supabase SQL Editor ↗
        </a>
        <Button size="sm" onClick={onRecheck}>
          I have run it — check again
        </Button>
      </div>

      <textarea
        readOnly
        value={sql ?? "Loading…"}
        onFocus={(e) => e.currentTarget.select()}
        spellCheck={false}
        className="h-40 w-full rounded border border-line-strong bg-paper p-2 font-mono text-[11px] leading-snug"
        aria-label="Setup SQL to paste into the Supabase SQL Editor"
      />

      <p className="text-xs text-ink-muted">
        Prefer not to paste SQL? Add <code className="font-mono">SUPABASE_DB_URL</code> to this
        deployment&rsquo;s environment variables (Supabase → Project Settings → Database → Connection
        string, port 5432) and redeploy — then this page does it for you.
      </p>
    </div>
  );
}
