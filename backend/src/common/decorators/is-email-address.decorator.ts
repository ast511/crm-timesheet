import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { EMAIL_MAX_LENGTH } from '../constants/email.constants';

/**
 * An email address — trimmed, lower-cased, then checked.
 *
 * Lower-casing is normalisation, not cosmetics. PostgreSQL's unique indexes are
 * case-sensitive, so without folding, `HR@company.com` and `hr@company.com`
 * would be two rows as far as the database is concerned, while every mail
 * server on the receiving end treats the domain — and, in practice, the
 * mailbox — as one. Folding at the edge is what makes those indexes the real
 * guarantee behind each module's duplicate check rather than a partial one.
 *
 * Feature 009 wrote this inside the users module as `IsUserEmail`. Feature 016
 * needed the identical rule for timesheet approval addresses, so it moves here
 * instead of being copied: nothing in the reasoning above is specific to a user
 * account, and a second copy would be the one that eventually stops folding the
 * case. It joins `@IsIsoDateString()`, which arrived here by the same route.
 */
export function IsEmailAddress() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? normalizeEmailAddress(value) : value,
    ),
    IsString(),
    IsNotEmpty(),
    IsEmail(),
    MaxLength(EMAIL_MAX_LENGTH),
  );
}

/**
 * The folding {@link IsEmailAddress} applies, as a function.
 *
 * Extracted so that a caller which cannot go through the `ValidationPipe` folds
 * an address *identically* rather than approximately. There is exactly one such
 * caller: the rate limiter's client key (Feature 034), which runs in a guard —
 * before any DTO exists — and keys `POST /auth/login` on the submitted address.
 * A second spelling of `trim().toLowerCase()` there would be a limiter that
 * counted `Maria@company.com` and `maria@company.com` as two accounts while
 * `AuthService` looked up one row, which is a bypass rather than an
 * inconsistency.
 */
export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}
