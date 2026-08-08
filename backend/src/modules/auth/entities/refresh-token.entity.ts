import type { Prisma } from '../../../generated/prisma/client';

/**
 * A stored refresh token, as this module reads it back.
 *
 * **`tokenHash` is absent, and its absence is the point** — the same argument
 * `UserEntity` makes about `passwordHash`, one turn stronger. A password hash is
 * an offline oracle; a refresh token hash is one half of a working credential,
 * and the only thing standing between a `SELECT *` in a support session and a
 * live session for every logged-in employee is that nobody ever reads the column
 * out. So nothing does: it is written when a token is issued, and afterwards it
 * appears only inside a `where`, where PostgreSQL matches it and never returns
 * it.
 *
 * Excluding it is enforced by the types rather than by discipline.
 * {@link REFRESH_TOKEN_SELECT} is handed to every read in `AuthService`, and
 * {@link StoredRefreshToken} has no `tokenHash` for anything to copy — so a
 * `select` left off produces a row this type will not accept.
 *
 * None of this is ever sent to a client. There is no `GET /auth/sessions` in
 * this feature; the type exists so the rotation logic has something to reason
 * about, and a session list — which would be the first thing to render it — is
 * noted as a follow-up rather than guessed at here.
 */
export interface StoredRefreshToken {
  id: string;
  userId: string;
  /** Null while the token is still usable; set when it is spent or revoked. */
  revokedAt: Date | null;
  /** The token this one was rotated into. Non-null means it has been used. */
  replacedById: string | null;
  expiresAt: Date;
}

/**
 * The columns every read of `refresh_tokens` in this module asks for.
 *
 * `satisfies Prisma.RefreshTokenSelect` checks the keys against the model
 * without widening the constant, so a column renamed in `schema.prisma` breaks
 * the build here instead of at runtime.
 */
export const REFRESH_TOKEN_SELECT = {
  id: true,
  userId: true,
  revokedAt: true,
  replacedById: true,
  expiresAt: true,
} as const satisfies Prisma.RefreshTokenSelect;

/**
 * Whether a stored token may still be exchanged.
 *
 * Three conditions, and they are *three* rather than one flag because each has a
 * different answer attached. `revokedAt` covers logout and a family revocation;
 * `replacedById` covers a token that was already rotated, which is the one the
 * caller must treat as theft rather than as expiry; `expiresAt` covers time
 * passing, which is nobody's fault.
 *
 * `replacedById` is checked separately by the caller *before* this function is
 * consulted, because "spent" and "unusable" are not the same event. This
 * function answers the plain question, so that the ordinary rejection path has
 * one condition to state.
 */
export function isUsable(token: StoredRefreshToken, now: Date): boolean {
  return (
    token.revokedAt === null &&
    token.replacedById === null &&
    token.expiresAt > now
  );
}
