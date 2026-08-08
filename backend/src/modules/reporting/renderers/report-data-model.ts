import { ReportType } from '../reporting.constants';

/**
 * The one shape every report is reduced to, and the reason preview and export
 * can never disagree.
 *
 * **Aggregate once, render three ways.** A builder reads resolved inputs and
 * produces one of these; the JSON response *is* this object, the Excel renderer
 * formats it into a worksheet, and the PDF renderer lays it out on pages. None
 * of the three adds a number, re-sorts a row or re-derives a total — every
 * figure a person can see was computed in the builder, once.
 *
 * That is not tidiness. Reporting's failure mode is subtle: an export that
 * quietly disagrees with the screen it was downloaded from is worse than one
 * that fails, because somebody forwards it. Three renderers each doing their own
 * arithmetic would eventually round a total differently, or filter one grid and
 * not another, and nothing would catch it. Here the parity test is a real
 * assertion — the same model, three outputs, the same numbers — rather than a
 * hope.
 *
 * It follows that this model is **presentation-complete**: rows are already in
 * their final order, group bands and total rows are already in the list, and
 * every cell already carries the text a renderer should print. A renderer that
 * needs to know what a report *means* is a renderer that will diverge.
 */
export interface ReportDataModel {
  readonly reportType: ReportType;

  /** `Collective attendance sheet` — the heading in English. */
  readonly title: string;

  /**
   * `Foaie colectivă de prezență` — the name the people who asked for these
   * reports actually use.
   *
   * Carried beside the English title rather than instead of it, because the
   * printed documents are Romanian while every other string this API produces is
   * English. Both are in the model so the renderers do not have to choose.
   */
  readonly romanianTitle: string;

  /** One line under the heading: what the grid shows, and for how many people. */
  readonly subtitle: string;

  readonly period: ReportPeriod;

  /** When this was generated, ISO-8601 UTC. Rendered in the company's zone. */
  readonly generatedAt: string;

  /**
   * How a PDF page is turned.
   *
   * On the model rather than in the PDF renderer because it is a property of the
   * *report* — the four grid reports are wide and the status summary is not — and
   * a renderer holding a list of which types are landscape would be a second
   * place that has to learn about a sixth report.
   */
  readonly orientation: ReportOrientation;

  /**
   * Which timesheet states this report counted, in a sentence.
   *
   * Printed on every export and returned in every preview, because it is the one
   * thing that makes two of these reports show different totals for the same
   * month and the one thing a reader cannot infer from the grid. An attendance
   * sheet counting only approved months and a leave calendar ignoring timesheets
   * entirely are both correct and are not comparable, and the document should say
   * so on its face rather than in a wiki.
   */
  readonly sourceNote: string;

  readonly kpis: readonly ReportKpi[];

  readonly columns: readonly ReportColumn[];

  /**
   * Every row in final order — data rows, client group bands and total rows
   * together.
   *
   * One ordered list rather than `rows` plus `groups` plus `totalRows`, because
   * the order is the report: a group band belongs immediately above the projects
   * it introduces, and a total row belongs last. Split across three properties, a
   * renderer would have to re-interleave them, and the three renderers would
   * eventually interleave them differently.
   */
  readonly rows: readonly ReportRow[];

  /**
   * What the markers in the grid mean.
   *
   * **Built per report from the days that actually occur in the period**, never
   * from the full list of configured leave types. A legend listing eight kinds of
   * leave for a month in which two were taken is a legend nobody reads; and one
   * hard-coded in this module would go stale the day a company adds a leave type.
   *
   * Empty on the reports that use no markers, which is how a renderer knows not
   * to draw a legend box at all.
   */
  readonly legend: readonly ReportLegendItem[];
}

export type ReportOrientation = 'portrait' | 'landscape';

/** The single month a report covers. */
export interface ReportPeriod {
  readonly month: number;
  readonly year: number;
  /** `September 2026` — what a heading and a legend print. */
  readonly label: string;
  /** `2026-09` — what a filename carries. */
  readonly key: string;
  /**
   * The company's IANA zone, from the Work Schedule singleton.
   *
   * Reported so a reader knows which clock the instant-valued columns were
   * rendered against — see `toZonedDateKey`. It does **not** shift the calendar
   * dates: a timesheet entry's `date` is a calendar day, not a moment, and
   * re-interpreting it through a zone would move it a column.
   */
  readonly timezone: string;
}

/** One figure in the header strip above the grid. */
export interface ReportKpi {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  /** `hours`, `employees` — what the number counts, printed under it. */
  readonly unit: string;
}

export type ReportColumnType = 'text' | 'number' | 'marker';

/** One column of the grid. */
export interface ReportColumn {
  readonly key: string;
  readonly label: string;
  /**
   * The second line of a column header — an employee's code, or their
   * department.
   *
   * The two hour matrices differ in exactly this: the project report labels its
   * employee columns with the department, the employee report with the employee
   * code. Same data, same builder input, two presentations.
   */
  readonly sublabel: string | null;
  readonly type: ReportColumnType;
  /** The right-hand total column, which renderers emphasise. */
  readonly isTotal: boolean;
}

export type ReportRowKind =
  /** An ordinary row of the grid. */
  | 'data'
  /** A full-width band introducing the rows beneath it — a client. */
  | 'group'
  /** A totals row, emphasised and never split from the grid by a page break. */
  | 'total';

/** One row of the grid. */
export interface ReportRow {
  readonly key: string;
  readonly kind: ReportRowKind;
  /** What a `group` or `total` row prints across its width. */
  readonly label: string;
  /**
   * A short badge before the label on a group band — `TEC` for `TechCorp
   * Solutions`.
   *
   * Derived from the client's name rather than looked up, because **this
   * application has no client entity**: a project names its customer in
   * `Project.clientName`, a free string. The badge is presentation and nothing
   * keys off it.
   */
  readonly badge: string | null;
  readonly cells: Readonly<Record<string, ReportCell>>;
}

/**
 * One cell, as a discriminated union.
 *
 * The discriminant is what keeps numbers numeric in the spreadsheet. An Excel
 * export whose hour cells are strings looks identical on screen and is useless:
 * `SUM` over the column returns zero, and sorting is alphabetical. So a cell
 * carries its machine value *and* the text a renderer should print, and the
 * Excel renderer writes the former while the PDF renderer writes the latter.
 */
export type ReportCell = ReportTextCell | ReportNumberCell | ReportMarkerCell;

export interface ReportTextCell {
  readonly kind: 'text';
  readonly text: string | null;
}

export interface ReportNumberCell {
  readonly kind: 'number';
  /**
   * The number itself, or `null` for a cell with no value.
   *
   * `null` rather than `0`, and the distinction is load-bearing on the two hour
   * matrices: a project an employee did not touch is blank, and writing `0`
   * would turn a grid that is mostly empty into a wall of zeros while claiming
   * somebody booked no hours to something they were never on.
   */
  readonly value: number | null;
  /** `140h`, `—`. What the PDF prints. */
  readonly text: string;
}

export interface ReportMarkerCell {
  readonly kind: 'marker';
  /** `C`, `S`, `L` — one to three characters. */
  readonly marker: string;
  /** What the PDF prints, which may be richer than the marker. */
  readonly text: string;
  /** Ties the cell to its {@link ReportLegendItem}. */
  readonly legendKey: string;
}

/** One entry in the legend under a grid. */
export interface ReportLegendItem {
  readonly key: string;
  readonly marker: string;
  readonly label: string;
}

/** A blank cell, which every grid needs more of than any other kind. */
export const EMPTY_CELL: ReportTextCell = { kind: 'text', text: null };

/**
 * The dash a grid prints where there is no number.
 *
 * One constant rather than a literal at each of the several places a cell can be
 * empty, so the two hour matrices cannot end up printing different characters
 * for the same absence.
 */
export const NO_VALUE_TEXT = '-';
