import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

import { Trim } from '../../../common/decorators/trim.decorator';
import {
  REPORT_CLIENT_NAME_MAX_LENGTH,
  REPORT_MAX_MONTH,
  REPORT_MAX_YEAR,
  REPORT_MIN_MONTH,
  REPORT_MIN_YEAR,
} from '../reporting.constants';

/**
 * The per-field rules shared by the reporting DTOs.
 *
 * The same split every module since Feature 007 uses: **constraints** live here,
 * **optionality** stays on the DTO, because `@IsOptional()` is what distinguishes
 * a required parameter from a filter and has to be readable on the class it
 * applies to.
 *
 * The relation ids are not here — they use the shared `@IsRelationId()`, which
 * Feature 013 moved into `common/decorators` precisely so a sixth module would
 * not write it again.
 *
 * **Nothing here consults the work schedule or the calendar.** These decorators
 * check that a request is *shaped* like a report request — a month is one of
 * twelve, a year is plausible — and every rule that depends on data (whether the
 * population is within the cap, whether a project exists) belongs to the service,
 * which is the only thing that can read it.
 */

/**
 * `month` — one of the twelve, in a **JSON body**.
 *
 * Not coerced from a string, unlike the timesheet module's query-string month:
 * these parameters arrive in the body of a `POST`, where `9` and `"9"` are
 * genuinely different values and the string is a payload the client should fix.
 * The export's `format` is the one parameter that travels in the query string,
 * and it is text either way.
 */
export function IsReportMonth() {
  return applyDecorators(IsInt(), Min(REPORT_MIN_MONTH), Max(REPORT_MAX_MONTH));
}

/** `year` — a plausible calendar year, in a JSON body. */
export function IsReportYear() {
  return applyDecorators(IsInt(), Min(REPORT_MIN_YEAR), Max(REPORT_MAX_YEAR));
}

/**
 * `clientName` — the customer to narrow a project report to.
 *
 * Trimmed, bounded, and **not** upper-cased. `Project.clientName` stores the name
 * as it was typed, so folding the case here would compare a normalised value
 * against an unnormalised column; the service instead compares
 * case-insensitively in PostgreSQL, which is the only place that can do it
 * against the stored spelling.
 *
 * A blank string collapses to `undefined` rather than filtering for the empty
 * name: a cleared input on a form posts `""`, and treating that as a filter would
 * return an empty report for a client nobody has.
 */
export function IsReportClientName() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      if (typeof value !== 'string') {
        return value;
      }

      const trimmed = value.trim();

      return trimmed.length === 0 ? undefined : trimmed;
    }),
    Trim(),
    IsString(),
    MaxLength(REPORT_CLIENT_NAME_MAX_LENGTH),
  );
}
