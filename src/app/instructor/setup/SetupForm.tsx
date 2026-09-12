"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    fetch("/api/instructor/bootstrap", { cache: "no-store" })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

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

      {!status.schemaReady && !status.canRunMigration && (
        <Notice tone="warn" title="One value is missing">
          <p className="mt-1 leading-relaxed">
            The tables do not exist and this deployment has no direct database connection to create them.
            Add <code className="font-mono">SUPABASE_DB_URL</code> to the environment — Supabase → Project
            Settings → Database → Connection string, <strong>port 5432</strong> — and redeploy.
          </p>
        </Notice>
      )}

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
