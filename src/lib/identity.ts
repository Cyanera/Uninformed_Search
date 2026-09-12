"use client";

import type { StudentIdentity } from "@/lib/types";

/**
 * The student's identity lives in localStorage only. There is no account and
 * no password: the `clientToken` issued at join time is what proves ownership
 * of a set of answers, so it must never appear in a URL or in any UI.
 */
const KEY = "uninformed-search:identity";

export function storeIdentity(identity: StudentIdentity): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(identity));
  } catch {
    // Private browsing with storage disabled: the student can still work, they
    // just have to rejoin if they refresh.
  }
}

export function loadIdentity(): StudentIdentity | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudentIdentity;
    if (!parsed?.participantId || !parsed?.clientToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearIdentity(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
