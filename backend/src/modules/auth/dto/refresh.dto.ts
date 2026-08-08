import { IsString, MaxLength, MinLength } from 'class-validator';

import { Trim } from '../../../common/decorators/trim.decorator';
import {
  REFRESH_TOKEN_MAX_LENGTH,
  REFRESH_TOKEN_MIN_LENGTH,
} from '../auth.constants';

/**
 * Body of `POST /api/v1/auth/refresh`, and of `POST /api/v1/auth/logout`.
 *
 * One class for both, because both carry exactly one thing and it is the same
 * thing: the refresh token identifying the session. A `LogoutDto` extending this
 * with nothing added would be a second name for one shape — the duplication the
 * project's DRY rule exists to prevent — and the day logout grows a field of its
 * own is the day it earns a class.
 *
 * **Trimmed**, unlike a password. A token is machine-generated and carries no
 * whitespace, so a leading newline is a copy-paste artefact from a terminal or a
 * `.http` file rather than part of the credential, and refusing it would be
 * pedantry that costs an integrator an hour. Trimming is also what makes the
 * SHA-256 lookup deterministic: the hash of a token with a trailing newline
 * matches no row, and the resulting `401` would be indistinguishable from a
 * revoked session.
 *
 * The bounds are shape only, and they are here because this endpoint is
 * `@Public()`: without them an anonymous caller could push arbitrary length into
 * a hash and a JWT parse. Whether the token is genuine is the signature's answer
 * and then the database's, and neither question is asked until the string is
 * plausibly a token.
 */
export class RefreshDto {
  @Trim()
  @IsString()
  @MinLength(REFRESH_TOKEN_MIN_LENGTH)
  @MaxLength(REFRESH_TOKEN_MAX_LENGTH)
  readonly refreshToken!: string;
}
