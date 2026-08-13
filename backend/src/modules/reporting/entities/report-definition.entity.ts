import type { ReportType } from '../reporting.constants';

/**
 * One entry of the report menu, as `GET /reports` returns it.
 *
 * The shape was declared inline on `REPORT_DEFINITIONS` until Feature 038 and
 * moved here for the reason every other response shape lives in `entities/`:
 * only a class in such a file is picked up by the schema generator. The
 * constant still annotates itself with it, so the five literals are checked
 * against this declaration exactly as they were against the inline type.
 *
 * `import type` on `ReportType`, deliberately: `reporting.constants.ts`
 * annotates its constant with this class, so a value import in either direction
 * would close a runtime cycle between the two files. Types are erased, so this
 * one costs nothing.
 */
export class ReportDefinitionEntity {
  /** The key that goes in the URL — `attendance-sheet`. */
  readonly key!: ReportType;

  /** The English name, for a menu. */
  readonly name!: string;

  /**
   * The Romanian name, which is what the people who asked for these reports
   * actually call them and what the printed document carries.
   */
  readonly romanianName!: string;

  /**
   * What the report shows **and which timesheet states it counts**.
   *
   * The second half is the part that matters: it is the one thing a person
   * choosing between two reports cannot infer from the title, and the one thing
   * that makes two of these show different totals for the same month.
   */
  readonly description!: string;
}
