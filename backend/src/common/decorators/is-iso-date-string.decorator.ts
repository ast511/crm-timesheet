import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString } from 'class-validator';

import { Trim } from './trim.decorator';

/**
 * An ISO-8601 date or timestamp, kept as a string.
 *
 * Validated rather than transformed: `@Type(() => Date)` would hand
 * `@IsDateString()` a `Date` to reject, and converting first with a bare
 * `new Date(value)` would accept `01/13/2020` — a format whose meaning depends
 * on which side of the Atlantic reads it. The string is parsed once, in the
 * service, on its way into Prisma, which is also where it can be compared
 * against the other end of a range.
 *
 * Features 010 and 011 each declared this inside their own module
 * (`IsEmployeeHireDate`, `IsProjectDate`) with byte-identical bodies. Feature
 * 013 would have been the third, so it moves here instead: every date this API
 * accepts is the same kind of value, and the reasoning above is a decision that
 * should be recorded once.
 *
 * ## The `@ApiProperty` (Feature 038)
 *
 * The rules above are invisible to the OpenAPI generator: it reads the
 * decorators written on a *property*, and everything here is behind a function
 * call. Without this line the documented schema would say `string` and nothing
 * more — shape-complete and useless, since the one thing a consumer needs to
 * know about a date field is which spellings of a date are accepted.
 *
 * **No `format: 'date-time'`, deliberately**, tempting though it is.
 * `@IsDateString()` accepts a bare `2026-09-01` as well as a full instant, and
 * `date-time` in OpenAPI means RFC 3339 — a generated client validating against
 * it would reject a value this API takes. Claiming the narrower format would be
 * documentation that is wrong in the direction that breaks clients. What is
 * left is an `example`, and the rule that both spellings are accepted is stated
 * once in the document's own description rather than on thirty fields.
 *
 * There is no `description` here, and that is the rule this project follows for
 * every composed decorator: constraints belong to the decorator, prose belongs
 * to the field. A `description` set here would silently outrank the JSDoc a DTO
 * writes above the property, which is always the more specific of the two.
 */
export function IsIsoDateString() {
  return applyDecorators(
    ApiProperty({ type: String, example: '2026-09-01T00:00:00.000Z' }),
    Trim(),
    IsString(),
    IsDateString(),
  );
}
