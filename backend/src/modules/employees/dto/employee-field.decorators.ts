import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { Trim } from '../../../common/decorators/trim.decorator';
import {
  EmployeeStatus,
  SeniorityLevel,
} from '../../../generated/prisma/enums';
import {
  EMPLOYEE_CODE_MAX_LENGTH,
  EMPLOYEE_CODE_PATTERN,
  EMPLOYEE_MAX_VACATION_DAYS,
  EMPLOYEE_MIN_VACATION_DAYS,
  EMPLOYEE_NAME_MAX_LENGTH,
  EMPLOYEE_PHONE_MAX_LENGTH,
  EMPLOYEE_RELATION_ID_MAX_LENGTH,
} from '../employee.constants';

/**
 * The per-field rules shared by `CreateEmployeeDto` and `UpdateEmployeeDto`.
 *
 * The same split the three modules before this one use: **constraints** live
 * here, **optionality** stays on the DTO, because `@IsOptional()` is what
 * distinguishes "create" from "patch" and has to be readable on the class it
 * applies to.
 */

/**
 * `employeeCode` — trimmed, upper-cased, then checked.
 *
 * Upper-casing is normalisation, not cosmetics: PostgreSQL's unique index is
 * case-sensitive, so without it `emp-0001` and `EMP-0001` would be two
 * employees as far as the database is concerned. Folding the case at the edge
 * makes that index the real guarantee rather than a partial one.
 */
export function IsEmployeeCode() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim().toUpperCase() : value,
    ),
    IsString(),
    IsNotEmpty(),
    MaxLength(EMPLOYEE_CODE_MAX_LENGTH),
    Matches(EMPLOYEE_CODE_PATTERN, {
      message:
        'employeeCode must contain only letters and digits, optionally separated by "-" or "_"',
    }),
  );
}

/**
 * `firstName` / `lastName` — trimmed, non-empty, bounded.
 *
 * Case is preserved as typed and there is no character pattern, deliberately.
 * Names carry diacritics (`Ștefan`), hyphens, apostrophes and spaces, and every
 * pattern narrow enough to be worth writing eventually rejects somebody's real
 * name.
 */
export function IsEmployeeName() {
  return applyDecorators(
    Trim(),
    IsString(),
    IsNotEmpty(),
    MaxLength(EMPLOYEE_NAME_MAX_LENGTH),
  );
}

/**
 * `phone` — trimmed, and blank collapses to `null`.
 *
 * A cleared input posts `""`, which is not a shorter phone number but the
 * absence of one; storing it verbatim would give the nullable column two values
 * meaning "empty" and force every reader to check for both.
 *
 * No format check, for the same reason names have no pattern: the column holds
 * whatever a human typed, in whichever national convention, and a regex tight
 * enough to be useful would reject valid international numbers. Normalising to
 * E.164 is a decision for whenever something actually dials it.
 */
export function IsEmployeePhone() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      if (typeof value !== 'string') {
        return value;
      }

      const trimmed = value.trim();

      return trimmed.length === 0 ? null : trimmed;
    }),
    IsString(),
    MaxLength(EMPLOYEE_PHONE_MAX_LENGTH),
  );
}

/**
 * `hireDate` — an ISO-8601 date or timestamp, kept as a string.
 *
 * Validated rather than transformed: `@Type(() => Date)` would hand
 * `@IsDateString()` a `Date` to reject, and converting first with a bare
 * `new Date(value)` would accept `01/13/2020` — a format whose meaning depends
 * on which side of the Atlantic reads it. The string is parsed once, in the
 * service, on its way into Prisma.
 */
export function IsEmployeeHireDate() {
  return applyDecorators(Trim(), IsString(), IsDateString());
}

/** `seniority` — one of the `SeniorityLevel` values the column accepts. */
export function IsEmployeeSeniority() {
  return applyDecorators(IsEnum(SeniorityLevel));
}

/** `status` — one of the `EmployeeStatus` values the column accepts. */
export function IsEmployeeStatus() {
  return applyDecorators(IsEnum(EmployeeStatus));
}

/**
 * `maxVacationDays` — a whole number of days, strictly positive and bounded.
 *
 * `@IsInt()` and not `@Type(() => Number)`: this arrives in a JSON body, where
 * `21` and `"21"` are genuinely different values, and coercing the string would
 * accept a payload the client should fix.
 */
export function IsEmployeeMaxVacationDays() {
  return applyDecorators(
    IsInt(),
    Min(EMPLOYEE_MIN_VACATION_DAYS),
    Max(EMPLOYEE_MAX_VACATION_DAYS),
  );
}

/**
 * `userId` / `departmentId` / `positionId` — a foreign key as it arrives.
 *
 * Shape only. Whether the row exists is a question for the database, and the
 * service asks it before writing; a `@ParseUUIDPipe`-style format check would
 * reject cuids, which is what this schema generates.
 */
export function IsRelationId() {
  return applyDecorators(
    Trim(),
    IsString(),
    IsNotEmpty(),
    MaxLength(EMPLOYEE_RELATION_ID_MAX_LENGTH),
  );
}
