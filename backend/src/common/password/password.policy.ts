import { applyDecorators } from '@nestjs/common';
import {
  IsString,
  MinLength,
  registerDecorator,
  ValidationArguments,
} from 'class-validator';

import { MAX_PASSWORD_BYTES } from './password.hasher';

/**
 * What this application accepts as a password, in one place — Feature 036.
 *
 * **One policy, four endpoints.** A password can now be set from four
 * directions: activating a new account, resetting a forgotten one, changing a
 * known one, and — before 036 — an administrator typing one into `POST /users`.
 * Four copies of a length rule is four chances for them to disagree, and the way
 * they disagree in practice is that the strictest one is applied to the path
 * everybody uses while a weaker one guards the path an attacker reaches for.
 *
 * It lives in `common/password` beside {@link MAX_PASSWORD_BYTES} rather than in
 * the users module, because it is a statement about *passwords* and the modules
 * that enforce it — users, auth, and whatever asks next — are three. The same
 * journey `@IsEmailAddress()` made in Feature 016.
 *
 * ## The rule, and what is deliberately not in it
 *
 * A floor of {@link PASSWORD_MIN_LENGTH} characters and a ceiling of
 * {@link MAX_PASSWORD_BYTES} bytes. **No composition rules** — no required
 * upper-case letter, digit or symbol — and their absence is a decision rather
 * than an omission: NIST SP 800-63B found that composition rules push people
 * towards predictable substitutions (`Password1!`) that satisfy a checker while
 * being easier to guess than the passphrase they replaced. The same reasoning
 * `USER_PASSWORD_MIN_LENGTH` already recorded when it was the only rule.
 *
 * The ceiling is bcrypt's and is measured in **bytes**, because that is the unit
 * the algorithm truncates on: seventy-two emoji are 288 bytes, and a check
 * counting characters would wave them through for `hashPassword` to reject with
 * a `500`.
 *
 * Nothing here trims. Leading and trailing spaces are legitimate characters in a
 * passphrase, and silently removing them would mean the password accepted at
 * activation is not the password the person typed.
 */

/**
 * Shortest password the API accepts, in characters.
 *
 * 8 is the NIST SP 800-63B minimum for a user-chosen secret. It is a floor, not
 * a policy.
 *
 * It is the same number `USER_PASSWORD_MIN_LENGTH` held, and that constant now
 * re-exports this one rather than declaring a second: the users module's
 * password bound was never a property of that module, and Feature 036 moved it
 * out when three modules started needing it.
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * The password rule, as a decorator — the only way a DTO in this project should
 * accept one.
 *
 * Optionality stays on the DTO, the same split every `*-field.decorators.ts`
 * file here uses: this states what a password *is*, `@IsOptional()` states
 * whether the field has to be there.
 */
export function IsPassword() {
  return applyDecorators(
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH),
    MaxByteLength(MAX_PASSWORD_BYTES),
  );
}

/**
 * Rejects a string whose UTF-8 encoding exceeds `max` bytes.
 *
 * `@MaxLength()` counts UTF-16 code units, which is the wrong unit for any limit
 * imposed by a binary format. Non-strings pass, leaving them to the
 * `@IsString()` alongside, whose message is far better than a length check
 * failing on a number.
 *
 * Moved here from `users/dto/user-field.decorators.ts`, where it was private to
 * the one DTO pair that needed it; the auth module's three password bodies need
 * the identical check, and a second copy is how the two would drift.
 */
function MaxByteLength(max: number): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'maxByteLength',
      target: target.constructor,
      propertyName: propertyName as string,
      constraints: [max],
      validator: {
        validate(value: unknown): boolean {
          return (
            typeof value !== 'string' || Buffer.byteLength(value, 'utf8') <= max
          );
        },
        defaultMessage({ property }: ValidationArguments): string {
          return `${property} must not exceed ${max} bytes`;
        },
      },
    });
  };
}
