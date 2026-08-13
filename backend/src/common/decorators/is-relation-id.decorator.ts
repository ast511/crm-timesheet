import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidationOptions,
} from 'class-validator';

import { RELATION_ID_MAX_LENGTH } from '../constants/relation.constants';
import { Trim } from './trim.decorator';

/** A cuid of the length this schema's `@default(cuid())` produces. */
const EXAMPLE_CUID = 'clv8k2x9b000008l3fh7g2n1q';

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
 *
 * `options` is forwarded to each of the three rules, which exists for one
 * caller: `{ each: true }`, so a property holding a *list* of foreign keys gets
 * the same treatment element by element. Feature 023's
 * `replacementEmployeeIds` is that property. The alternative — spelling the
 * three rules out again with `each` on each of them — is the duplication this
 * decorator was extracted to prevent, and the copy would be the one that forgot
 * the length bound. `@Trim()` is applied once and handles arrays itself.
 *
 * The `@ApiProperty` (Feature 038) publishes the two bounds the rules above
 * impose — non-empty and bounded — which are otherwise invisible to the schema
 * generator, since it reads decorators written on a property and these are
 * behind a function call. No `description`: constraints belong to the
 * decorator, prose to the field, and one set here would outrank the JSDoc a DTO
 * writes above the property.
 *
 * `example` is a cuid because that is what this schema generates. There is
 * deliberately **no `format` or `pattern`** beside it — the validation has none
 * either, and publishing one would promise a check this API does not make.
 *
 * `each` is handled rather than ignored: on a list of foreign keys the bounds
 * are per element, so they are published on `items`. Documenting a `maxLength`
 * on the array itself would say the *list* may hold fifty entries, which is a
 * different claim and a false one.
 *
 * No `type` is passed in either branch, on purpose. The plugin has already
 * worked out whether the property is a string or an array of them, and naming a
 * type here would overwrite that with a worse guess.
 */
export function IsRelationId(options?: ValidationOptions) {
  const bounds = { minLength: 1, maxLength: RELATION_ID_MAX_LENGTH };

  return applyDecorators(
    ApiProperty(
      options?.each
        ? {
            isArray: true,
            items: { type: 'string', ...bounds },
            example: [EXAMPLE_CUID],
          }
        : { ...bounds, example: EXAMPLE_CUID },
    ),
    Trim(),
    IsString(options),
    IsNotEmpty(options),
    MaxLength(RELATION_ID_MAX_LENGTH, options),
  );
}
