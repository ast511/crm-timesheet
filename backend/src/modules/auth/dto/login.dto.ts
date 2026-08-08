import { IsString, MaxLength, MinLength } from 'class-validator';

import { IsEmailAddress } from '../../../common/decorators/is-email-address.decorator';
import { MAX_PASSWORD_BYTES } from '../../../common/password/password.hasher';

/**
 * Body of `POST /api/v1/auth/login`.
 *
 * `email` reuses the shared `@IsEmailAddress()` — trimmed, lower-cased, bounded
 * at RFC 5321's 254 characters — and reusing it is not tidiness, it is
 * correctness. That decorator's lower-casing is what makes the account lookup
 * find the row: `POST /users` folded the address before storing it, so an
 * address typed `Maria.Ionescu@company.com` at the login screen must be folded
 * the same way before it is compared, and a second spelling of that rule here
 * would be the one that eventually stopped folding. The `WHERE email =` in
 * `AuthService` is an equality against a `@unique` column, which is exactly as
 * case-sensitive as PostgreSQL's index.
 *
 * `password` is validated for **shape only**, and the difference from
 * `CreateUserDto` is deliberate. That DTO enforces `USER_PASSWORD_MIN_LENGTH`
 * because it is *setting* a password and a policy belongs where the choice is
 * made; this one is *checking* one, and rejecting a short password with a
 * `400` before it is compared would tell an anonymous caller something about the
 * policy — and, worse, would turn a legitimate account whose password predates a
 * policy change into an account that can no longer log in. A password of any
 * length is compared and fails the same way.
 *
 * What it does enforce is the upper bound, and that one is not cosmetic: this is
 * a public, unauthenticated endpoint, and without a bound it would hand a
 * megabyte of attacker-supplied text to a deliberately slow hash function, once
 * per request — a denial of service with a single `curl`. The number is
 * `MAX_PASSWORD_BYTES`, bcrypt's own ceiling, borrowed rather than invented so
 * that the longest password this endpoint accepts is the longest password
 * `POST /users` could ever have created.
 *
 * It is applied as a **character** limit here where `IsUserPassword` applies it
 * as a byte one, and the asymmetry is right in both directions. Creating a
 * password has to reject 72 emoji with a `400` naming the field, because bcrypt
 * would silently truncate them and two different passphrases would become
 * interchangeable. Checking one does not: `verifyPassword` answers `false` for
 * over-long input without hashing it, which is the correct answer — no such
 * password can ever have been stored — and it does so cheaply, which is all this
 * bound was protecting.
 *
 * The password is not trimmed. Leading and trailing spaces are legitimate
 * characters in a passphrase, and `CreateUserDto` does not trim them either; a
 * login that silently stripped what a creation kept would refuse the correct
 * password.
 */
export class LoginDto {
  @IsEmailAddress()
  readonly email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PASSWORD_BYTES)
  readonly password!: string;
}
