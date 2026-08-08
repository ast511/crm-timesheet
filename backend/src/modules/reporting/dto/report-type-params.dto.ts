import { IsIn } from 'class-validator';

import { Trim } from '../../../common/decorators/trim.decorator';
import { REPORT_TYPES, ReportType } from '../reporting.constants';

/**
 * The `:reportType` segment of `/api/v1/reports/:reportType/...`.
 *
 * A DTO rather than a plain `@Param('reportType') string`, so an unknown key is
 * refused by the global `ValidationPipe` before any service is entered — and
 * refused with a message that **names the five valid keys**, which is what
 * `@IsIn` produces. A caller who mistypes `attendence-sheet` is told what the
 * five are rather than being told only that this was not one of them.
 *
 * It answers `400` rather than `404`, and the choice is the one this project
 * makes everywhere: `404` is about a *resource* that is not there, and a report
 * type is not a resource — nothing creates one, nothing deletes one, and the set
 * is fixed in `reporting.constants.ts`. An unrecognised key is a malformed
 * request, which is what `400` says. The same reasoning `LEAVE_TYPE_SORT_FIELDS`
 * and `TIMESHEET_SORT_FIELDS` apply to a `?sortBy=` that names no column.
 *
 * The same class serves the preview and the export, so the two can never come to
 * accept different sets of report types.
 */
export class ReportTypeParamsDto {
  @Trim()
  @IsIn(REPORT_TYPES)
  readonly reportType!: ReportType;
}
