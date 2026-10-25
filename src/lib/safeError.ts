// Server-only helper: converts unexpected internal/database/provider errors
// into a single generic user-facing error, while logging the technical detail
// to the SERVER console only. The error thrown to the client never contains raw
// Postgres messages, SQL, table/column names, tokens, PHI or stack traces.

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** Marks an error as deliberately user-facing (validation/auth/not-found). */
export class UserFacingError extends Error {
  readonly userFacing = true;
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

type DbLikeError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
};

/**
 * Logs the full technical detail (Postgres/PostgREST code, message, details,
 * hint) for the developer and returns a generic Error to throw to the client.
 * Usage: `if (error) throw dbError("shares.list", error);`
 *
 * Handy codes when debugging a local Supabase project:
 *   PGRST205 / 42P01 missing table   PGRST202 missing function
 *   PGRST204 / 42703 missing column  42501 / RLS policy violation
 */
export function dbError(operation: string, error?: unknown): Error {
  const e = (error ?? {}) as DbLikeError;
  console.error(
    `[db] failed op=${operation}`,
    JSON.stringify({
      code: e.code,
      status: e.status,
      message: e.message ?? (error instanceof Error ? error.message : undefined),
      details: e.details,
      hint: e.hint,
    }),
  );
  return new Error(GENERIC_ERROR_MESSAGE);
}

/** Rethrows deliberate user-facing errors, genericises everything else. */
export function toSafeError(operation: string, error: unknown): Error {
  if (error instanceof UserFacingError) return error;
  return dbError(operation, error);
}
