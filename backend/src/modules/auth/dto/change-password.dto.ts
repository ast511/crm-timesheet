import { IsString, MaxLength } from 'class-validator';

import { MAX_PASSWORD_BYTES } from '../../../common/password/password.hasher';
import { IsPassword } from '../../../common/password/password.policy';

/**
 * Body of `POST /api/v1/auth/change-password` — the only password change made by
 * somebody who already knows the password.
 *
 * ## Why the two fields are validated differently
 *
 * `newPassword` carries the full policy: it is about to become a credential, so
 * it has to satisfy the floor and bcrypt's ceiling.
 *
 * `currentPassword` deliberately does **not**. It is a value being *checked*
 * rather than stored, and applying `@MinLength(8)` to it would be a subtle
 * mistake in two directions. It would reject — with a `400` naming the field —
 * a caller whose real password predates the policy, telling them their password
 * is too short rather than letting the comparison simply fail; and it would turn
 * the endpoint into a length oracle, since a seven-character guess would be
 * refused in a visibly different way from a wrong eight-character one. It is
 * bounded only so that an authenticated caller cannot push an unbounded string
 * into a bcrypt comparison, and `verifyPassword` already answers `false` for
 * anything over the limit rather than throwing.
 *
 * ## What is not here
 *
 * No `userId`. The account is the caller's, taken from `@CurrentUser()`, and
 * accepting an id would make "change my password" and "change somebody else's
 * password" the same endpoint distinguished by a field — which is the shape that
 * eventually ships with the ownership check missing. Nobody can change another
 * person's password through this API at all; an administrator's lever is
 * deactivation, and a locked-out person's is `POST /auth/forgot-password`.
 *
 * No `refreshToken` either, **as of Feature 040**, and this class is down to the
 * two fields it should always have had. It used to carry an optional refresh
 * token naming the session to keep alive — every *other* session of the account
 * is revoked by a password change, and without it the person would be signed out
 * of the very page they were on. That is still exactly what happens; the session
 * to spare is now read from the `HttpOnly` cookie the request already carries,
 * in `AuthController`.
 *
 * It belonged in a body even less than it appeared to. The field was never a
 * credential and proved nothing — the access token had already said who was
 * calling and the current password had already been verified — it was only ever
 * used to *exclude* one row from a revocation. A client cannot read its own
 * refresh token any more, so a field asking for one would be a field nobody
 * could fill. The safe default is unchanged and unchanged in direction: no
 * cookie spares nothing, every session ends including this one, and the cost of
 * being wrong is one extra sign-in rather than a session that should have died
 * and did not.
 */
export class ChangePasswordDto {
  @IsString()
  @MaxLength(MAX_PASSWORD_BYTES)
  readonly currentPassword!: string;

  @IsPassword()
  readonly newPassword!: string;
}
