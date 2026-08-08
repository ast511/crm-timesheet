import { IsIn } from 'class-validator';

import { Trim } from '../../../common/decorators/trim.decorator';
import { REPORT_FORMATS, ReportFormat } from '../reporting.constants';

/**
 * Query string of `POST /api/v1/reports/:reportType/export?format=`.
 *
 * The one parameter that is **not** in the body, and the split is deliberate
 * rather than untidy. Everything in `ReportQueryDto` describes *which numbers*
 * the report contains, and the export and the preview must take those
 * identically or the parity guarantee means nothing. `format` describes only how
 * the same numbers are drawn, it applies to no other endpoint, and it is the
 * thing a client toggles between two download buttons — so it belongs where a
 * client can change it without rebuilding the request.
 *
 * Keeping it out of the body also keeps the two endpoints' bodies literally the
 * same class, which is what lets the parity test post one object to both.
 */
export class ExportQueryDto {
  /**
   * `pdf` or `excel`. **Required** — there is no default.
   *
   * A default was rejected because the two produce genuinely different artefacts
   * for different purposes: a PDF is the document somebody signs and files, an
   * xlsx is the grid somebody pivots. Guessing which one a caller meant would
   * send the wrong one silently, and the caller only finds out after the
   * download.
   *
   * Validated against a closed list, since the value chooses a renderer and sets
   * a `Content-Type`: anything not enumerated has to be rejected before it
   * reaches either. Trimmed and matched exactly — `?format=PDF` is refused rather
   * than folded, so the API has one spelling for each format.
   */
  @Trim()
  @IsIn(REPORT_FORMATS)
  readonly format!: ReportFormat;
}
