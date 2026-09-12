import { describe, expect, it } from "vitest";
import { resolveSupabaseUrl, resolveSupabaseUrlDetailed } from "@/lib/supabase/config";

/**
 * "Invalid supabaseUrl" is the way a real deployment of this app broke, so the
 * repairs are pinned here.
 */
describe("resolveSupabaseUrl", () => {
  const REF = "abcdefghijklmnop";
  const API = `https://${REF}.supabase.co`;

  it("passes a correct API URL through unchanged", () => {
    expect(resolveSupabaseUrl(API)).toBe(API);
  });

  it("repairs a bare project ref", () => {
    expect(resolveSupabaseUrl(REF)).toBe(API);
    expect(resolveSupabaseUrlDetailed(REF).repaired).toBe(true);
  });

  it("repairs a hostname with no scheme", () => {
    expect(resolveSupabaseUrl(`${REF}.supabase.co`)).toBe(API);
  });

  it("repairs the dashboard URL, which is the one in the address bar", () => {
    expect(resolveSupabaseUrl(`https://supabase.com/dashboard/project/${REF}`)).toBe(API);
    expect(resolveSupabaseUrl(`https://supabase.com/dashboard/project/${REF}/settings/api`)).toBe(API);
  });

  it("strips trailing slashes, quotes and whitespace from a paste", () => {
    expect(resolveSupabaseUrl(`  ${API}/  `)).toBe(API);
    expect(resolveSupabaseUrl(`"${API}"`)).toBe(API);
    expect(resolveSupabaseUrl(`${API}///`)).toBe(API);
  });

  it("drops any path, so a copied deep link still works", () => {
    expect(resolveSupabaseUrl(`${API}/rest/v1/`)).toBe(API);
  });

  it("refuses supabase.com itself rather than guessing", () => {
    const r = resolveSupabaseUrlDetailed("https://supabase.com");
    expect(r.url).toBeNull();
    expect(r.note).toMatch(/not at your project/i);
  });

  it("refuses junk instead of throwing", () => {
    for (const bad of ["", "   ", "not a url", "ftp://x.supabase.co", "1234"]) {
      const r = resolveSupabaseUrlDetailed(bad);
      expect(r.url).toBeNull();
      expect(typeof r.note).toBe("string");
    }
  });

  it("never throws, whatever it is given", () => {
    const inputs = [undefined, "", "://", "http://", "https://.", "a".repeat(500)];
    for (const input of inputs) {
      expect(() => resolveSupabaseUrlDetailed(input)).not.toThrow();
    }
  });

  it("accepts a self-hosted instance on a custom domain", () => {
    expect(resolveSupabaseUrl("https://supabase.uj.edu.sa")).toBe("https://supabase.uj.edu.sa");
  });
});
