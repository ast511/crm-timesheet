import { applyDecorators } from '@nestjs/common';
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
 */
export function IsIsoDateString() {
  return applyDecorators(Trim(), IsString(), IsDateString());
}
