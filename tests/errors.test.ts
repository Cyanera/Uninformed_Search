import { describe, expect, it } from "vitest";
import { isMissingTableError } from "@/lib/supabase/errors";

describe("isMissingTableError", () => {
  it("recognises what PostgREST actually returns for a missing table", () => {
    expect(
      isMissingTableError({
        code: "PGRST205",
        message: "Could not find the table 'public.sessions' in the schema cache",
      }),
    ).toBe(true);
  });

  it("still recognises the raw Postgres code", () => {
    expect(isMissingTableError({ code: "42P01" })).toBe(true);
  });

  it("falls back to the message when no code is given", () => {
    expect(isMissingTableError({ message: 'relation "public.sessions" does not exist' })).toBe(true);
  });

  it("does not fire on unrelated failures", () => {
    expect(isMissingTableError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingTableError({ code: "PGRST116", message: "expected 1 row" })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
    expect(isMissingTableError(undefined)).toBe(false);
    expect(isMissingTableError({})).toBe(false);
  });
});
