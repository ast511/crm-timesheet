/**
 * The reporting module's fixed vocabulary: the five report keys, the day
 * classes, the caps, and the month/year bounds.
 *
 * **The five reports are a closed set and this file is what makes that true.**
 * A report type is not a row somebody creates — it is a rendering somebody
 * wrote, with a builder, a column layout and a legend — so the keys are a
 * literal union here rather than a table, and `?reportType=` is validated
 * against it before anything else happens.
 *
 * Note what is *not* here, for the same reason `timesheet-management.constants`
 * holds no hour figure: **no marker for a kind of leave.** Which glyph a day of
 * annual leave prints is `LeaveType.reportMarker`, configured per company, and a
 * constant for it here would mean a leave type added next year either printing
 * nothing or colliding with one of these. The fixed classes below are the ones
 * that are genuinely fixed — a holiday, a non-working day, a worked day — and
 * every one of them is a fact about the *calendar*, not about a row somebody
 * configures.
 */

// `import type`, and it has to be: `ReportDefinitionEntity` names `ReportType`
// from this file, so a value import here would close a runtime cycle. A type
// import is erased and closes nothing.
import type { ReportDefinitionEntity } from './entities/report-definition.entity';

/**
 * The five reports, as the URL names them.
 *
 * Spelled in kebab-case because they are path segments —
 * `POST /reports/attendance-sheet/preview` — and a path segment that needs
 * escaping is a path segment somebody will get wrong.
 */
export const REPORT_TYPES = [
  'project-hours-per-employee',
  'timesheet-status',
  'attendance-sheet',
  'leave-calendar',
  'employee-hours-per-project',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

/**
 * The two file formats an export produces.
 *
 * A closed list rather than a free string: the value chooses a renderer and sets
 * a MIME type, so anything not enumerated here has to be rejected by validation
 * before it reaches either.
 *
 * There is deliberately no `csv` and no `json`. A CSV cannot carry the frozen
 * header, the numeric cells or the merged group rows that make these grids
 * readable, and JSON is already what `/preview` returns — offering it as a
 * download would be a second way to ask for a thing the API answers.
 */
export const REPORT_FORMATS = ['pdf', 'excel'] as const;

export type ReportFormat = (typeof REPORT_FORMATS)[number];

/** The twelve months, as the API names them: `1` is January, not `0`. */
export const REPORT_MIN_MONTH = 1;

export const REPORT_MAX_MONTH = 12;

/**
 * The earliest and latest year a report may name.
 *
 * The same bounds the timesheets, the leave requests and the public-holiday
 * calendar use, and restated rather than imported for the reason
 * `TIMESHEET_HOURS_DECIMAL_PLACES` is restated: this module owns what a *report*
 * may be asked for, and borrowing another module's bound would make one feature's
 * validation change when an unrelated one was edited.
 *
 * They exist so `20266` is a `400` naming the field rather than a query that
 * scans for rows nobody will ever have.
 */
export const REPORT_MIN_YEAR = 2000;

export const REPORT_MAX_YEAR = 2100;

/**
 * Bound on `?clientName=`.
 *
 * The column it filters is unbounded `text`, so this is an API-level contract
 * rather than a schema mirror: it stops a huge term being pushed into a
 * comparison, and it is the value a form's `maxlength` should be generated from.
 * The same call every module since Feature 007 makes for its search parameter.
 */
export const REPORT_CLIENT_NAME_MAX_LENGTH = 200;

/**
 * The language these documents are written in.
 *
 * `ro-RO`, stated here rather than assumed at each call site, because the reports
 * are the **one** part of this API that is not English. Every other string the
 * application produces — error messages, notification wording, month names — is
 * English, on the grounds that the API has no locale to render into. A report is
 * different: it is a printed document with a Romanian title, Romanian column
 * headings and a *Legendă*, handed to somebody who reads Romanian, so a date in
 * it has to read `07.08.2026` rather than `2026-08-07`.
 *
 * **It governs display only**, and that distinction is load-bearing. `toDateKey`
 * and `toZonedDateKey` still produce ISO strings, because those are *keys* — a
 * column of a grid, an entry in a `Map` — and a key whose shape changed with the
 * language would break every lookup in the feature. What this locale decides is
 * the handful of values a person actually reads: the generation timestamp and the
 * last-modified column.
 *
 * One constant, so the `?locale=` parameter recorded under Future Improvements is
 * a value threaded to one place rather than a search through three renderers.
 */
export const REPORT_LOCALE = 'ro-RO';

/**
 * The largest population one report may render.
 *
 * **A guard against a pathological request, not a policy about company size.**
 * Every one of these reports is a grid: the attendance sheet and the leave
 * calendar are employees × days, and the two hour matrices are projects ×
 * employees. Generation is synchronous, so an unbounded population is an
 * unbounded amount of work inside one request — and the PDF renderer in
 * particular lays out every cell before it can emit a page.
 *
 * 500 is chosen against what the reports are *for*: a month of 500 employees is
 * a 500 × 31 grid, roughly 15,000 cells, which renders in well under a second
 * and produces a PDF somebody can still open. Beyond it, the answer is not a
 * bigger cap but the asynchronous pipeline the feature document records — and a
 * `400` naming the cap says exactly that, where a request that merely took two
 * minutes would look like a broken server.
 */
export const REPORT_MAX_EMPLOYEES = 500;

/**
 * The same guard for the other axis of the two hour matrices.
 *
 * Reports 1 and 5 put one column (or row) per project, and a company with
 * thousands of archived projects would otherwise produce a spreadsheet nobody
 * can scroll and a PDF hundreds of pages wide. The filters — `projectId`,
 * `clientName` — are how a caller narrows past this.
 */
export const REPORT_MAX_PROJECTS = 500;

/**
 * The classes a single day can fall into, other than leave.
 *
 * **Fixed, unlike leave**, and the asymmetry is the point. A holiday, a
 * non-working day and a worked day are facts about the calendar and the work
 * schedule — they are the same three facts in every company that will ever run
 * this application, so they are named here and their markers are stable. Which
 * *kinds* of leave exist is configuration, so a leave day carries the marker its
 * `LeaveType` was given and this file says nothing about it.
 *
 * The classes are **mutually exclusive and total**: every day of the month falls
 * into exactly one of these or into leave, which is what lets a report assert
 * that its day counts sum to the length of the month.
 */
export const DAY_CLASSES = [
  'NOT_EMPLOYED',
  'NON_WORKING',
  'HOLIDAY',
  'LEAVE',
  'WORKED',
  'EXPECTED',
] as const;

export type DayClass = (typeof DAY_CLASSES)[number];

/**
 * The glyph each fixed class prints, and what a legend calls it.
 *
 * `LEAVE` is absent on purpose: a leave day's marker comes from its
 * `LeaveType.reportMarker` and there is no single letter that could stand for
 * "some kind of leave". A lookup that returned one would be exactly the fixed
 * bucket this feature was told not to build.
 *
 * **`NON_WORKING` is one class, not "weekend" plus "free day".** This
 * application has no weekend rule — Feature 030 established that "not loggable"
 * means "not in `WorkSchedule.workingDays`", so a company working Tuesday to
 * Saturday has its Sunday and Monday off — and splitting the class in two would
 * require this module to invent which of those two a Saturday is. `L` is the
 * marker a Romanian attendance sheet uses for *liber*, which covers both.
 */
export const FIXED_DAY_MARKERS: Readonly<
  Record<Exclude<DayClass, 'LEAVE'>, { marker: string; label: string }>
> = {
  NOT_EMPLOYED: { marker: '·', label: 'Outside employment' },
  NON_WORKING: { marker: 'L', label: 'Free / non-working day' },
  HOLIDAY: { marker: 'S', label: 'Public holiday' },
  WORKED: { marker: '', label: 'Worked' },
  EXPECTED: { marker: '', label: 'Working day, nothing recorded' },
};

/**
 * How the five reports are named and described in `GET /reports`.
 *
 * Static metadata, computed from nothing, so the endpoint that renders a menu
 * costs no query. The descriptions state **which timesheet states each report
 * counts**, because that is the one thing a person choosing between them cannot
 * infer from the title and the one thing that makes two of these numbers differ.
 */
export const REPORT_DEFINITIONS: readonly ReportDefinitionEntity[] = [
  {
    key: 'project-hours-per-employee',
    name: 'Project hours per employee',
    romanianName: 'Centralizator ore proiect per angajat',
    description:
      'Hours worked on each project, broken down by employee and grouped by client. Counts APPROVED timesheets only, WORK entries only.',
  },
  {
    key: 'timesheet-status',
    name: 'Timesheet status summary',
    romanianName: 'Centralizator stare timesheeturi',
    description:
      'One row per employee: where their month stands, when it last moved, and how their days divide between leave, holidays, free days and working days. Reads timesheets in every state, since the state is what it reports.',
  },
  {
    key: 'attendance-sheet',
    name: 'Collective attendance sheet',
    romanianName: 'Foaie colectivă de prezență',
    description:
      'A grid of employees by days, showing hours on a worked day and a marker on every other. Counts APPROVED timesheets only.',
  },
  {
    key: 'leave-calendar',
    name: 'Monthly employee leave calendar',
    romanianName: 'Situații lunare concedii angajați',
    description:
      'A grid of employees by days showing what each day was. Built from approved leave and public holidays; it does not depend on any timesheet existing.',
  },
  {
    key: 'employee-hours-per-project',
    name: 'Employee hours per project',
    romanianName: 'Centralizator ore utilizator per proiect',
    description:
      'The same project-by-employee hours as the project report, totalled per employee and listed flat with the client as a column. Counts APPROVED timesheets only, WORK entries only.',
  },
];

/**
 * What the two hour matrices and the attendance sheet print about their source.
 *
 * One constant because the three must say the same thing: they count the same
 * timesheets under the same rule, and a reader comparing an attendance sheet
 * against an hours matrix needs to know the two are drawn from the same set. A
 * sentence written three times is a sentence that ends up saying three things.
 */
export const APPROVED_WORK_ONLY_NOTE =
  'Source: APPROVED timesheets only. Draft, submitted and rejected months are excluded, and only WORK entries are counted — leave and public holidays are absence rather than effort.';

/** What the status summary prints, which is the one report reading every state. */
export const ALL_STATES_NOTE =
  'Source: timesheets in every state, since the state is what this report is about. An employee with no timesheet for the period is reported as "Fără timesheet".';

/** What the leave calendar prints, which reads no timesheet at all. */
export const LEAVE_ONLY_NOTE =
  'Source: approved leave requests and public holidays. This report does not depend on any timesheet existing or having been approved.';

/**
 * The month names a title and a filename are written with.
 *
 * English, like every other human-readable string this API produces. The
 * report *titles* carry their Romanian name alongside, because those are the
 * names the people who asked for these reports use for them — but a month is
 * rendered once, here, rather than in each of the three renderers.
 */
export const REPORT_MONTH_NAMES: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
