/**
 * Connection options for running the migration over a direct Postgres link.
 *
 * Supabase requires TLS. A self-hosted or local Postgres usually has none, and
 * forcing it there fails with "The server does not support SSL connections".
 * One helper, used by both the deployed setup route and the CLI script, so the
 * two cannot disagree.
 */
export interface PgOptions {
  connectionString: string;
  ssl?: { rejectUnauthorized: boolean };
  connectionTimeoutMillis: number;
}

export function isLocalPostgres(url: string): boolean {
  return /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) || /sslmode=disable/.test(url);
}

/** True for the transaction pooler, which cannot run a multi-statement script. */
export function isTransactionPooler(url: string): boolean {
  return /:6543\//.test(url);
}

export function pgOptions(connectionString: string): PgOptions {
  return {
    connectionString,
    ssl: isLocalPostgres(connectionString) ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  };
}
