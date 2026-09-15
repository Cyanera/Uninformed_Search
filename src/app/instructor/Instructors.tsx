"use client";

import { useEffect, useState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";

/**
 * Adding a colleague to the app.
 *
 * The new account works immediately — no confirmation email, whose link would
 * point at the project's Site URL and strand whoever followed it. Instructors
 * are peers: each one sees only the sessions they created, so this shares the
 * app, not the class data.
 */

interface Row {
  id: string;
  email: string;
  isYou: boolean;
}

export function Instructors() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/instructor/instructors");
      if (!res.ok) return;
      const body = (await res.json()) as { instructors?: Row[] };
      setRows(body.instructors ?? []);
    } catch {
      // The list is informational; failing to load it should not take the page
      // down or block adding somebody.
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function close() {
    setOpen(false);
    setError(null);
    setEmail("");
    setPassword("");
    setCurrentPassword("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await fetch("/api/instructor/instructors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, currentPassword }),
      });
      const body = (await res.json()) as { email?: string; error?: string };

      if (!res.ok) {
        setError(body.error ?? "The account could not be created.");
        return;
      }

      setDone(body.email ?? email);
      close();
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The account could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold tracking-tight">Instructors</h2>

      {rows && rows.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded border border-line text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <span>{row.email}</span>
              {row.isYou && <span className="text-xs text-ink-muted">(you)</span>}
            </li>
          ))}
        </ul>
      )}

      {done && (
        <div className="mt-3">
          <Notice tone="goal" title={`${done} can sign in now.`}>
            Send them the sign-in page and the password you chose. They will see only the sessions they
            create themselves.
          </Notice>
        </div>
      )}

      {open ? (
        <form onSubmit={submit} className="mt-3 max-w-sm space-y-4 rounded border border-line bg-canvas p-4">
          <Field label="Their email" htmlFor="new-instructor-email">
            <Input
              id="new-instructor-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
            />
          </Field>

          <Field
            label="Password for them"
            htmlFor="new-instructor-password"
            hint="At least 6 characters. They can sign in with it straight away — no confirmation email."
          >
            <Input
              id="new-instructor-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              required
            />
          </Field>

          <Field
            label="Your own password"
            htmlFor="new-instructor-confirm"
            hint="Asked for so that nobody else can add an account while you are away from the laptop."
          >
            <Input
              id="new-instructor-confirm"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          {error && <Notice tone="warn">{error}</Notice>}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </Button>
            <Button type="button" size="sm" onClick={close} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          size="sm"
          className="mt-3"
          onClick={() => {
            setDone(null);
            setOpen(true);
          }}
        >
          Add an instructor
        </Button>
      )}
    </section>
  );
}
