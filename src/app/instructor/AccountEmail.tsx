"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";

/**
 * The sign-in email, with a way to change it.
 *
 * The new address applies at once — no confirmation email, because the link in
 * one points at the project's Site URL and is how an account gets stranded. The
 * current password is asked for instead, which is what makes that safe.
 */
export function AccountEmail({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nextEmail, setNextEmail] = useState(email);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setError(null);
    setPassword("");
    setNextEmail(email);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await fetch("/api/instructor/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: nextEmail, password }),
      });
      const body = (await res.json()) as { email?: string; error?: string };

      if (!res.ok) {
        setError(body.error ?? "The email could not be changed.");
        return;
      }

      setDone(body.email ?? nextEmail);
      setOpen(false);
      setPassword("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The email could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <span>{email}</span>
        <button
          type="button"
          onClick={() => {
            setDone(null);
            setOpen(true);
          }}
          className="rounded underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          Change email
        </button>
        {done && <span className="text-goal">Saved — sign in with {done} from now on.</span>}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 max-w-sm space-y-4 rounded border border-line bg-canvas p-4">
      <Field label="New sign-in email" htmlFor="account-email">
        <Input
          id="account-email"
          type="email"
          value={nextEmail}
          onChange={(e) => setNextEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </Field>

      <Field
        label="Current password"
        htmlFor="account-password"
        hint="Asked for so that nobody else can move this account while you are away from the laptop."
      >
        <Input
          id="account-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>

      {error && <Notice tone="warn">{error}</Notice>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save email"}
        </Button>
        <Button type="button" size="sm" onClick={close} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
