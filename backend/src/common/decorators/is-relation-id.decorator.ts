import { applyDecorators } from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { RELATION_ID_MAX_LENGTH } from '../constants/relation.constants';
import { Trim } from './trim.decorator';

/**
 * A foreign key as it arrives from a client: trimmed, non-empty, bounded.
 *
 * Shape only. Whether the row exists is a question for the database, and the
 * service asks it before writing; a `@ParseUUIDPipe`-style format check would
 * reject cuids, which is what this schema generates.
 *
 * Feature 010 wrote this inside the employees module, on the grounds that one
 * consumer is not yet a pattern. Feature 013 is the second — project
 * memberships are *made of* two foreign keys — and the shape held unchanged, so
 * it moves here rather than being declared identically in two modules. That is
 * the same call Feature 008 made when `sortOrder` moved into `SortQueryDto`.
 *
 * It sits beside `@Trim()`, `@ToBoolean()` and `@ValidateIfPresent()` because it
 * is the same kind of thing: a transport concern with nothing resource-specific
 * in it.
 */
export function IsRelationId() {
  return applyDecorators(
    Trim(),
    IsString(),
    IsNotEmpty(),
    MaxLength(RELATION_ID_MAX_LENGTH),
  );
}
