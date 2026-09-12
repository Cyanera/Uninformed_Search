"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { normalizeSessionCode } from "@/lib/codes";
import { storeIdentity } from "@/lib/identity";
import type { StudentIdentity } from "@/lib/types";

export function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();

  const codeFromLink = normalizeSessionCode(params.get("code") ?? "");
  const [code, setCode] = useState(codeFromLink);
  // A student who scanned the QR already has the code; asking for it again is
  // just another thing to mistype.
  const [editingCode, setEditingCode] = useState(!codeFromLink);
  const [name, setName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/session/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, studentNumber }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not join the session.");
        return;
      }
      const identity = data.identity as StudentIdentity;
      storeIdentity(identity);
      router.push(`/s/${identity.sessionCode}`);
    } catch {
      setError("Network problem. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      {editingCode ? (
        <Field label="Session code" htmlFor="code" hint="Five characters, shown on the classroom screen.">
          <Input
            id="code"
            name="code"
            value={code}
            onChange={(e) => setCode(normalizeSessionCode(e.target.value))}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            maxLength={8}
            required
            className="font-mono text-2xl tracking-[0.3em]"
            placeholder="ABCDE"
          />
        </Field>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-accent-line bg-accent-soft px-3 py-2">
          <span className="text-sm text-ink-muted">
            Joining session{" "}
            <span className="font-mono text-base font-semibold text-accent">{code}</span>
          </span>
          <button
            type="button"
            onClick={() => setEditingCode(true)}
            className="text-xs text-accent underline-offset-2 hover:underline"
          >
            Change
          </button>
        </div>
      )}

      <Field label="Your name" htmlFor="name">
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
          maxLength={80}
        />
      </Field>

      <Field label="Student ID" htmlFor="studentNumber">
        <Input
          id="studentNumber"
          name="studentNumber"
          value={studentNumber}
          onChange={(e) => setStudentNumber(e.target.value)}
          autoComplete="off"
          required
          maxLength={40}
        />
      </Field>

      {error && <Notice tone="warn">{error}</Notice>}

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
        {busy ? "Joining…" : "Join session"}
      </Button>

      <p className="text-xs text-ink-muted">
        If you already joined on another device, use the same student ID and name to pick up your answers.
      </p>
    </form>
  );
}
