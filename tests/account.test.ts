import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanEmail } from "@/lib/api";
import { gotrueHeaders, isConfirmed, listAdminUsers, updateAdminUser } from "@/lib/supabase/gotrue";

describe("cleanEmail", () => {
  it("normalizes case and surrounding space", () => {
    expect(cleanEmail("  Ahad.Almasoudi@Gmail.com ")).toBe("ahad.almasoudi@gmail.com");
  });

  it("accepts the addresses a university actually uses", () => {
    for (const email of ["a@uj.edu.sa", "first.last+ai@gmail.com", "x_y-z@sub.domain.co.uk"]) {
      expect(cleanEmail(email)).toBe(email);
    }
  });

  it("rejects what is plainly not an address", () => {
    for (const value of ["", "   ", "ahad", "ahad@", "@gmail.com", "ahad@gmail", "a b@gmail.com", 42, null]) {
      expect(cleanEmail(value)).toBeNull();
    }
  });

  it("rejects an address too long to be real", () => {
    expect(cleanEmail(`${"a".repeat(250)}@gmail.com`)).toBeNull();
  });
});

describe("isConfirmed", () => {
  it("counts an account confirmed by either field", () => {
    expect(isConfirmed({ id: "1", email_confirmed_at: "2026-01-01" })).toBe(true);
    expect(isConfirmed({ id: "1", confirmed_at: "2026-01-01" })).toBe(true);
  });

  it("treats an account still waiting on an email as unusable", () => {
    expect(isConfirmed({ id: "1", email_confirmed_at: null, confirmed_at: null })).toBe(false);
    expect(isConfirmed({ id: "1" })).toBe(false);
  });
});

describe("gotrueHeaders", () => {
  it("sends the key both ways, which is what GoTrue expects", () => {
    expect(gotrueHeaders("k")).toEqual({
      apikey: "k",
      Authorization: "Bearer k",
      "Content-Type": "application/json",
    });
  });
});

describe("the auth admin calls", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("updates a user and reports success", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateAdminUser("https://p.supabase.co", "key", "u1", {
      email: "new@gmail.com",
      email_confirm: true,
    });

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://p.supabase.co/auth/v1/admin/users/u1");
    expect(init.method).toBe("PUT");
    // email_confirm is the whole point: without it Supabase mails a link that
    // points at the project's Site URL instead of applying the change.
    expect(JSON.parse(String(init.body))).toEqual({ email: "new@gmail.com", email_confirm: true });
  });

  it("surfaces the reason a change was refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ msg: "email already registered" }), { status: 422 })),
    );

    const result = await updateAdminUser("https://p.supabase.co", "key", "u1", { email: "taken@gmail.com" });
    expect(result).toEqual({ ok: false, error: "email already registered" });
  });

  it("falls back to the raw body when the failure is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("gateway down", { status: 502 })));
    const result = await updateAdminUser("https://p.supabase.co", "key", "u1", {});
    expect(result).toEqual({ ok: false, error: "gateway down" });
  });

  it("reports a network failure rather than throwing at the caller", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const result = await updateAdminUser("https://p.supabase.co", "key", "u1", {});
    expect(result).toEqual({ ok: false, error: "ECONNREFUSED" });
  });

  it("returns null, not an empty list, when the admin API cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    // An empty list would read as "no instructors yet" and reopen setup.
    expect(await listAdminUsers("https://p.supabase.co", "key")).toBeNull();
  });

  it("returns the users when it can", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ users: [{ id: "u1", email: "a@b.com" }] }), { status: 200 })),
    );
    expect(await listAdminUsers("https://p.supabase.co", "key")).toEqual([{ id: "u1", email: "a@b.com" }]);
  });
});
