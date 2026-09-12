import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeProjectUrl } from "../scripts/env";
import { needsWizard, writeEnvLocal } from "../scripts/wizard";

describe("normalizeProjectUrl", () => {
  it("accepts the API URL as-is", () => {
    const r = normalizeProjectUrl("https://abcdefghijklmnop.supabase.co");
    expect(r).toEqual({ ok: true, url: "https://abcdefghijklmnop.supabase.co" });
  });

  it("recovers the API URL from the dashboard URL, which is the likeliest paste", () => {
    const r = normalizeProjectUrl("https://supabase.com/dashboard/project/abcdefghijklmnop");
    expect(r).toEqual({ ok: true, url: "https://abcdefghijklmnop.supabase.co" });
  });

  it("recovers it from a deep dashboard link too", () => {
    const r = normalizeProjectUrl("https://supabase.com/dashboard/project/abcdefghijklmnop/settings/api");
    expect(r).toEqual({ ok: true, url: "https://abcdefghijklmnop.supabase.co" });
  });

  it("accepts a bare project ref", () => {
    expect(normalizeProjectUrl("abcdefghijklmnop")).toEqual({
      ok: true,
      url: "https://abcdefghijklmnop.supabase.co",
    });
  });

  it("tolerates trailing slashes and whitespace", () => {
    expect(normalizeProjectUrl("  https://abcdefghijklmnop.supabase.co//  ")).toEqual({
      ok: true,
      url: "https://abcdefghijklmnop.supabase.co",
    });
  });

  it("allows a self-hosted or custom domain", () => {
    expect(normalizeProjectUrl("https://supabase.uj.edu.sa")).toEqual({
      ok: true,
      url: "https://supabase.uj.edu.sa",
    });
  });

  it("rejects something that is neither a URL nor a ref", () => {
    const r = normalizeProjectUrl("my project");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/project ref/i);
  });

  it("rejects an empty value", () => {
    expect(normalizeProjectUrl("   ").ok).toBe(false);
  });
});

describe("needsWizard", () => {
  const dirs: string[] = [];
  const inTempDir = (write?: string): boolean => {
    const dir = mkdtempSync(join(tmpdir(), "uis-"));
    dirs.push(dir);
    if (write !== undefined) writeFileSync(join(dir, ".env.local"), write);
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      return needsWizard();
    } finally {
      process.chdir(cwd);
    }
  };

  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("is needed when there is no .env.local at all", () => {
    expect(inTempDir()).toBe(true);
  });

  it("is needed when the file exists but the required keys are blank", () => {
    expect(inTempDir("NEXT_PUBLIC_SUPABASE_URL=\nSUPABASE_SERVICE_ROLE_KEY=\n")).toBe(true);
  });

  it("is needed when only some required keys are present", () => {
    expect(inTempDir("NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co\n")).toBe(true);
  });

  it("is not needed once both required keys have values", () => {
    expect(
      inTempDir("NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=sb_secret_x\n"),
    ).toBe(false);
  });
});

describe("writeEnvLocal", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("writes every key and keeps the file owner-only", () => {
    const dir = mkdtempSync(join(tmpdir(), "uis-"));
    dirs.push(dir);
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const path = writeEnvLocal({
        projectUrl: "https://abcdefghijklmnop.supabase.co",
        anonKey: "sb_publishable_x",
        serviceKey: "sb_secret_x",
        dbUrl: "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres",
        instructorEmail: "teacher@uj.edu.sa",
        instructorPassword: "lecture2026",
      });

      const text = readFileSync(path, "utf8");
      expect(text).toContain("NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co");
      expect(text).toContain("SUPABASE_SERVICE_ROLE_KEY=sb_secret_x");
      expect(text).toContain("INSTRUCTOR_EMAIL=teacher@uj.edu.sa");

      // Credentials must not be world- or group-readable.
      const mode = statSync(path).mode & 0o777;
      expect(mode & 0o077).toBe(0);
    } finally {
      process.chdir(cwd);
    }
  });

  it("produces a file the env loader can read back", () => {
    const dir = mkdtempSync(join(tmpdir(), "uis-"));
    dirs.push(dir);
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      writeEnvLocal({
        projectUrl: "https://abcdefghijklmnop.supabase.co",
        anonKey: "a",
        serviceKey: "b",
        dbUrl: "",
        instructorEmail: "",
        instructorPassword: "",
      });
      // An empty optional value must not make the wizard think it is unconfigured.
      expect(needsWizard()).toBe(false);
    } finally {
      process.chdir(cwd);
    }
  });
});
