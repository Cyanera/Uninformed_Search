/**
 * Recognises "the tables do not exist yet".
 *
 * PostgREST does not pass Postgres's own 42P01 through: a missing table is
 * reported as PGRST205, "Could not find the table ... in the schema cache".
 * Checking only for 42P01 meant a fresh project never got redirected to setup
 * and showed a raw error on the instructor's home page instead.
 */
export function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (code === "42P01" || code === "PGRST205" || code === "PGRST202") return true;
  const message = error.message ?? "";
  return /could not find the table|schema cache|relation .* does not exist/i.test(message);
}
