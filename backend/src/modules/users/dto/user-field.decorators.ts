import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsString, MaxLength } from 'class-validator';

import { UserRole } from '../../../generated/prisma/enums';
import { USER_USERNAME_MAX_LENGTH } from '../user.constants';

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
    ApiProperty({
      maxLength: USER_USERNAME_MAX_LENGTH,
      example: 'maria.popescu',
      description:
        'Trimmed; a blank string is stored as `null` rather than as "".',
    }),
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
 * There is no `IsUserPassword` any more.
 *
 * Feature 036 took the password out of both DTOs in this module — an
 * administrator no longer sets anybody's password — so the rule had nothing left
 * to validate here. It did not disappear: it moved to
 * `common/password/password.policy.ts` as `@IsPassword()`, where the three auth
 * bodies that *do* accept a password share it. The byte-length check it used
 * went with it, for the same reason.
 */

/** `role` — one of the `UserRole` values the schema's enum column accepts. */
export function IsUserRole() {
  return applyDecorators(IsEnum(UserRole));
}
