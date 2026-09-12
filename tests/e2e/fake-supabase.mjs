/**
 * A minimal stand-in for Supabase, backed by a real PostgreSQL database.
 *
 * TEST ONLY. It implements just enough of PostgREST and GoTrue for the app to
 * run end to end, so the whole flow - setup, sign-in, a student joining and
 * submitting, the instructor's live board, analytics and Teach Mode - can be
 * exercised in a browser without a Supabase account.
 *
 * What it does NOT do is enforce row level security; every query runs as the
 * owner. RLS is verified separately by applying the real policies to a real
 * PostgreSQL instance and asserting who can read what.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";

const PORT = Number(process.env.FAKE_PORT ?? 8811);
const DB = process.env.FAKE_DB_URL;

const client = new pg.Client({ connectionString: DB });
await client.connect();

/** token -> user */
const sessions = new Map();

const OPERATORS = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  is: "is",
};

function buildWhere(params, values) {
  const clauses = [];
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    const value = rest.join(".");

    if (op === "in") {
      const list = value.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""));
      const placeholders = list.map((v) => {
        values.push(v);
        return `$${values.length}`;
      });
      clauses.push(`"${key}" in (${placeholders.join(",")})`);
      continue;
    }
    if (op === "is") {
      clauses.push(`"${key}" is ${value === "null" ? "null" : "not null"}`);
      continue;
    }
    const sqlOp = OPERATORS[op];
    if (!sqlOp) continue;
    values.push(value);
    clauses.push(`"${key}" ${sqlOp} $${values.length}`);
  }
  return clauses.length ? `where ${clauses.join(" and ")}` : "";
}

function buildOrder(params) {
  const order = params.get("order");
  if (!order) return "";
  const parts = order.split(",").map((entry) => {
    const [col, ...mods] = entry.split(".");
    const dir = mods.includes("desc") ? "desc" : "asc";
    return `"${col}" ${dir}`;
  });
  return `order by ${parts.join(", ")}`;
}

function json(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...headers });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function wantsObject(req) {
  return (req.headers.accept ?? "").includes("vnd.pgrst.object");
}

/* ------------------------------------------------------------- PostgREST */

async function handleRest(req, res, url) {
  const table = url.pathname.replace("/rest/v1/", "").split("/")[0];
  if (!table) return json(res, 200, {});

  const params = [...url.searchParams.entries()];
  const values = [];

  try {
    if (req.method === "GET") {
      const where = buildWhere(params, values);
      const order = buildOrder(url.searchParams);
      const limit = url.searchParams.get("limit") ? `limit ${Number(url.searchParams.get("limit"))}` : "";
      const { rows } = await client.query(`select * from public."${table}" ${where} ${order} ${limit}`, values);

      if (wantsObject(req)) {
        if (rows.length === 1) return json(res, 200, rows[0]);
        return json(res, 406, { code: "PGRST116", message: `expected 1 row, got ${rows.length}` });
      }
      return json(res, 200, rows);
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const records = Array.isArray(body) ? body : [body];
      if (!records.length || !records[0]) return json(res, 400, { message: "no rows" });

      const prefer = req.headers.prefer ?? "";
      const onConflict = url.searchParams.get("on_conflict");
      const inserted = [];

      for (const record of records) {
        const cols = Object.keys(record);
        const vals = cols.map((c) => record[c]);
        const placeholders = cols.map((_, i) => `$${i + 1}`);
        let sql = `insert into public."${table}" (${cols.map((c) => `"${c}"`).join(",")}) values (${placeholders.join(",")})`;

        if (prefer.includes("merge-duplicates") && onConflict) {
          const conflictCols = onConflict.split(",").map((c) => `"${c.trim()}"`).join(",");
          const updates = cols.filter((c) => !onConflict.split(",").includes(c)).map((c) => `"${c}" = excluded."${c}"`);
          sql += ` on conflict (${conflictCols}) do update set ${updates.join(", ")}`;
        }
        sql += " returning *";
        const { rows } = await client.query(sql, vals);
        inserted.push(...rows);
      }

      if (!prefer.includes("return=representation")) return json(res, 201, null);
      if (wantsObject(req)) {
        return inserted.length === 1
          ? json(res, 201, inserted[0])
          : json(res, 406, { code: "PGRST116", message: `expected 1 row, got ${inserted.length}` });
      }
      return json(res, 201, inserted);
    }

    if (req.method === "PATCH") {
      const body = await readBody(req);
      const cols = Object.keys(body ?? {});
      const sets = cols.map((c, i) => {
        values.push(body[c]);
        return `"${c}" = $${values.length}`;
      });
      const where = buildWhere(params, values);
      const { rows } = await client.query(
        `update public."${table}" set ${sets.join(", ")} ${where} returning *`,
        values,
      );
      if (wantsObject(req)) {
        return rows.length === 1
          ? json(res, 200, rows[0])
          : json(res, 406, { code: "PGRST116", message: `expected 1 row, got ${rows.length}` });
      }
      return json(res, 200, rows);
    }

    return json(res, 405, { message: "method not allowed" });
  } catch (error) {
    // Mirror the shape supabase-js expects, including the code the app checks.
    return json(res, 400, { code: error.code ?? "XX000", message: error.message });
  }
}

/* ----------------------------------------------------------------- GoTrue */

function tokenResponse(user) {
  const token = randomUUID();
  sessions.set(token, user);
  return {
    access_token: token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: randomUUID(),
    user,
  };
}

function userFromRequest(req) {
  const auth = req.headers.authorization ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return sessions.get(token) ?? null;
}

async function handleAuth(req, res, url) {
  const path = url.pathname.replace("/auth/v1", "");

  if (path.startsWith("/admin/users")) {
    const id = path.replace("/admin/users", "").replace(/^\//, "").split("?")[0];

    if (req.method === "GET") {
      const { rows } = await client.query(
        "select id, email, created_at, email_confirmed_at from auth.users order by created_at",
      );
      return json(res, 200, { users: rows, aud: "authenticated", total: rows.length });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      // Admin-created users are confirmed on the spot, as GoTrue does with
      // email_confirm: true.
      const { rows } = await client.query(
        `insert into auth.users (email, encrypted_password, email_confirmed_at)
         values ($1,$2,$3) returning id, email, created_at, email_confirmed_at`,
        [body.email, body.password, body.email_confirm ? new Date().toISOString() : null],
      );
      return json(res, 200, rows[0]);
    }

    if (req.method === "PUT" && id) {
      const body = await readBody(req);
      const { rows } = await client.query(
        `update auth.users
         set encrypted_password = coalesce($2, encrypted_password),
             email_confirmed_at = case when $3 then now() else email_confirmed_at end
         where id = $1 returning id, email, created_at, email_confirmed_at`,
        [id, body.password ?? null, !!body.email_confirm],
      );
      if (!rows.length) return json(res, 404, { message: "user not found" });
      return json(res, 200, rows[0]);
    }
  }

  if (path === "/signup" && req.method === "POST") {
    const body = await readBody(req);
    const { rows } = await client.query(
      "insert into auth.users (email, encrypted_password) values ($1,$2) returning id, email, created_at",
      [body.email, body.password],
    );
    const user = { ...rows[0], aud: "authenticated", role: "authenticated" };
    return json(res, 200, tokenResponse(user));
  }

  if (path === "/token" && req.method === "POST") {
    const body = await readBody(req);
    const { rows } = await client.query(
      "select id, email, created_at, encrypted_password from auth.users where email = $1",
      [body.email],
    );
    if (!rows.length || rows[0].encrypted_password !== body.password) {
      return json(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
    }
    const user = { id: rows[0].id, email: rows[0].email, created_at: rows[0].created_at, aud: "authenticated", role: "authenticated" };
    return json(res, 200, tokenResponse(user));
  }

  if (path === "/user" && req.method === "GET") {
    const user = userFromRequest(req);
    if (!user) return json(res, 401, { message: "invalid claim" });
    return json(res, 200, user);
  }

  if (path === "/logout") {
    const auth = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    sessions.delete(auth);
    return json(res, 204, null);
  }

  return json(res, 404, { message: `no fake handler for ${path}` });
}

/* ------------------------------------------------------------------ serve */

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    });
    return res.end();
  }

  if (url.pathname.startsWith("/rest/v1")) return handleRest(req, res, url);
  if (url.pathname.startsWith("/auth/v1")) return handleAuth(req, res, url);
  if (url.pathname.startsWith("/realtime")) {
    // The app polls as well as subscribing, so no websocket is needed here.
    return json(res, 404, { message: "realtime not implemented in the fake" });
  }
  return json(res, 200, {});
}).listen(PORT, () => console.error(`fake supabase on ${PORT}`));
