import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { Trim } from '../../../common/decorators/trim.decorator';
import { MAX_PASSWORD_BYTES } from '../../../common/password/password.hasher';
import { IsPassword } from '../../../common/password/password.policy';
import {
  REFRESH_TOKEN_MAX_LENGTH,
  REFRESH_TOKEN_MIN_LENGTH,
} from '../auth.constants';

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
 */
export class ChangePasswordDto {
  @IsString()
  @MaxLength(MAX_PASSWORD_BYTES)
  readonly currentPassword!: string;

  @IsPassword()
  readonly newPassword!: string;

  /**
   * The caller's own refresh token — the session **not** to end.
   *
   * Changing a password revokes the account's other sessions, which is the half
   * of the feature that matters when somebody suspects their password is known.
   * This field is what keeps the person doing it signed in on the machine they
   * are sitting at; without it they would change their password and be thrown
   * back to the login screen, which reads as a failure and teaches people to
   * avoid the feature.
   *
   * **Optional, and the default is the safe direction.** An absent or unrecognised
   * token spares nothing, so every session ends including this one. The cost of
   * being wrong is one extra sign-in; the cost of the opposite default — sparing
   * a session that was not really the caller's — would be leaving the very
   * session this change was meant to evict.
   *
   * It is not a second credential and proves nothing: the access token has
   * already said who is calling and the current password has already been
   * verified. It is only ever used to *exclude* a row from a revocation, so a
   * value belonging to somebody else spares one of their sessions and touches
   * nothing of theirs otherwise.
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(REFRESH_TOKEN_MIN_LENGTH)
  @MaxLength(REFRESH_TOKEN_MAX_LENGTH)
  readonly refreshToken?: string;
}
