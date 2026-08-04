import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidationArguments,
} from 'class-validator';

import { MAX_PASSWORD_BYTES } from '../../../common/password/password.hasher';
import { UserRole } from '../../../generated/prisma/enums';
import {
  USER_PASSWORD_MIN_LENGTH,
  USER_USERNAME_MAX_LENGTH,
} from '../user.constants';

/**
 * The per-field rules shared by `CreateUserDto` and `UpdateUserDto`.
 *
 * The same split the departments and positions modules use: **constraints**
 * live here, **optionality** stays on the DTO, because `@IsOptional()` is what
 * distinguishes "create" from "patch" and has to be readable on the class it
 * applies to.
 *
 * There is deliberately no decorator for `passwordHash`. The column is never a
 * request field — a client sends `password` and the service does the hashing —
 * so the DTOs have no property for it and the global pipe's
 * `forbidNonWhitelisted` turns an attempt to send one into a `400`.
 */

/**
 * `email` is not declared here. It uses the shared `@IsEmailAddress()`:
 * Feature 016 needed the same trim, the same lower-casing and the same RFC
 * bound for timesheet approval addresses, so the rule moved to
 * `common/decorators` rather than being copied — the same journey
 * `@IsIsoDateString()` made in Feature 013.
 */

/**
 * `username` — trimmed, and blank collapses to `null`.
 *
 * The column is nullable, so an account may have no username at all; a cleared
 * input posts `""`, which is the absence of one rather than a zero-length
 * handle. Storing it verbatim would give the column two values meaning "empty",
 * and — because `""` is not `NULL` — PostgreSQL's unique index would let
 * exactly one account hold it and reject every other blank submission with a
 * conflict nobody asked for.
 *
 * Case is preserved as typed; the uniqueness check folds it instead.
 */
export function IsUserUsername() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      if (typeof value !== 'string') {
        return value;
      }

      const trimmed = value.trim();

      return trimmed.length === 0 ? null : trimmed;
    }),
    IsString(),
    MaxLength(USER_USERNAME_MAX_LENGTH),
  );
}

/**
 * `password` — the plain-text secret, on its way to being hashed and discarded.
 *
 * Not trimmed. Leading and trailing spaces are legitimate characters in a
 * passphrase, and silently removing them would mean the password accepted at
 * creation is not the password the user typed.
 *
 * The upper bound is bcrypt's, expressed in **bytes** rather than characters
 * because that is the unit the algorithm truncates on: 72 emoji are 288 bytes,
 * and `@MaxLength(72)` would wave them through for `hashPassword` to reject
 * with a `500`. Validating it here makes it a `400` naming the field.
 */
export function IsUserPassword() {
  return applyDecorators(
    IsString(),
    MinLength(USER_PASSWORD_MIN_LENGTH),
    MaxByteLength(MAX_PASSWORD_BYTES),
  );
}

/** `role` — one of the `UserRole` values the schema's enum column accepts. */
export function IsUserRole() {
  return applyDecorators(IsEnum(UserRole));
}

/**
 * Rejects a string whose UTF-8 encoding exceeds `max` bytes.
 *
 * `@MaxLength()` counts UTF-16 code units, which is the wrong unit for any
 * limit imposed by a binary format. Non-strings pass, leaving them to the
 * `@IsString()` alongside, whose message is far better than a length check
 * failing on a number.
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
