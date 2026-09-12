"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button, Field, Input, Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * Sign in only.
 *
 * There is deliberately no sign-up here. Accounts are created once, on
 * /instructor/setup, which creates them already confirmed — signing up through
 * Supabase instead sends a confirmation email whose link points at whatever
 * Site URL the project happens to have, which is localhost by default. Nobody
 * should meet that ten minutes before a lecture.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/instructor";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<React.ReactNode>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        const message = signInError.message.toLowerCase();

        if (message.includes("not confirmed")) {
          setError(
            <>
              That account was created through a sign-up form and is waiting on a confirmation email you
              do not need. Use the email and password you entered on{" "}
              <Link href="/instructor/setup" className="underline">
                first-time setup
              </Link>{" "}
              instead — that account is already confirmed.
            </>,
          );
          return;
        }

        if (message.includes("invalid login")) {
          setError(
            <>
              Wrong email or password. If you have not set this app up yet, start at{" "}
              <Link href="/instructor/setup" className="underline">
                first-time setup
              </Link>
              .
            </>,
          );
          return;
        }

        setError(signInError.message);
        return;
      }

      router.replace(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>

      {error && <Notice tone="warn">{error}</Notice>}

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
