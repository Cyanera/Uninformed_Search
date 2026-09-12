import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, OUTPUT } from "../scripts/generate-schema";
import { MIGRATION_SQL, SEED_SQL } from "@/lib/setup/schema.generated";

/**
 * The deployed app creates its own database from the embedded SQL, so the
 * embedded copy must never drift from the files under supabase/.
 */
describe("embedded schema", () => {
  it("matches the SQL files it was generated from", () => {
    const current = readFileSync(resolve(process.cwd(), OUTPUT), "utf8");
    expect(current).toBe(render());
  });

  it("carries the real migration, not a stub", () => {
    expect(MIGRATION_SQL).toContain("create table if not exists public.strategy_submissions");
    expect(MIGRATION_SQL).toContain("enable row level security");
    expect(MIGRATION_SQL).toContain("supabase_realtime");
    expect(MIGRATION_SQL.length).toBeGreaterThan(5000);
  });

  it("carries the seeded problem", () => {
    expect(SEED_SQL).toContain("Campus Delivery Robot");
    expect(SEED_SQL).toContain('"from": "C", "to": "G", "cost": 3');
  });

  it("stays re-runnable, since setup may be retried", () => {
    expect(MIGRATION_SQL).toContain("create table if not exists");
    expect(SEED_SQL).toContain("on conflict");
  });
});
