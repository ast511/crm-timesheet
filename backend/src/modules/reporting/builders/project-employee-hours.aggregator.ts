import {
  ProjectEmployeeHourRow,
  ReportEmployee,
  ReportProject,
} from '../reporting.types';

/**
 * The project × employee hour matrix, computed **once** and rendered twice.
 *
 * Reports 1 and 5 are the same question — how many hours did each person book to
 * each project this month — asked by two documents that read in different
 * directions. Report 1 groups its projects under their client and emphasises the
 * per-project total; report 5 lists them flat with the client as a column and
 * emphasises the per-employee total. Same rows, same columns, same numbers,
 * different presentation.
 *
 * **So the aggregation is here and neither builder repeats it.** Written twice,
 * the two would drift the first time somebody fixed a rounding rule in one of
 * them, and the failure would be invisible: two documents about the same month
 * that quietly disagree, each internally consistent. The reconciliation test —
 * that both reports produce the same grand total, and that it equals the sum of
 * the per-project totals *and* the sum of the per-employee totals — is only
 * meaningful because there is one computation to reconcile.
 *
 * It is a **pure function over resolved inputs**: rows in, matrix out, no
 * queries, no Prisma, no clock. The summing that the database could not do —
 * Prisma groups by `(timesheetId, projectId)` because `employeeId` lives on the
 * timesheet rather than the entry, so the last fold from timesheet to person
 * happens in memory — happens here, over at most a few thousand pre-aggregated
 * rows rather than over every entry.
 */
export interface ProjectEmployeeHours {
  /** The projects with hours in the period, in the order both reports print. */
  readonly projects: readonly ReportProject[];
  /** The employees with hours in the period, in the order both reports print. */
  readonly employees: readonly ReportEmployee[];
  /** One cell, or `null` where that person booked nothing to that project. */
  cell(projectId: string, employeeId: string): number | null;
  /** A project's row total, across every employee. */
  projectTotal(projectId: string): number;
  /** An employee's column total, across every project. */
  employeeTotal(employeeId: string): number;
  readonly grandTotal: number;
}

/**
 * Folds the grouped hour rows into the matrix both reports read.
 *
 * The populations are passed in rather than derived from the rows, and that is
 * deliberate: a report's columns are the employees the *filters* selected, not
 * only the ones who happened to book hours. An employee who logged nothing still
 * gets a column of dashes and a total of zero, because "Maria booked no hours in
 * September" is the finding, and a report that silently dropped her would be
 * read as though she had not been asked.
 *
 * Projects are treated the other way and only those *with* hours appear — see
 * {@link toProjectEmployeeHours}'s caller — because a company accumulates
 * projects for years and a grid with three hundred empty rows is unreadable. The
 * asymmetry is a judgement about what each axis is for: the employee axis is the
 * population being reported on, the project axis is what they did.
 */
export function toProjectEmployeeHours(
  projects: readonly ReportProject[],
  employees: readonly ReportEmployee[],
  rows: readonly ProjectEmployeeHourRow[],
): ProjectEmployeeHours {
  const cells = new Map<string, number>();
  const projectTotals = new Map<string, number>();
  const employeeTotals = new Map<string, number>();
  let grandTotal = 0;

  for (const row of rows) {
    const key = cellKey(row.projectId, row.employeeId);

    // Summed rather than assigned: one `(project, employee)` pair can arrive as
    // several rows, because the grouping is by timesheet and a person has one
    // timesheet per month — but a filtered population, or a period that ever
    // spans more than a month, would produce two. Assigning would silently keep
    // the last one.
    cells.set(key, round(add(cells.get(key), row.hours)));
    projectTotals.set(
      row.projectId,
      round(add(projectTotals.get(row.projectId), row.hours)),
    );
    employeeTotals.set(
      row.employeeId,
      round(add(employeeTotals.get(row.employeeId), row.hours)),
    );
    grandTotal = round(grandTotal + row.hours);
  }

  return {
    projects,
    employees,
    grandTotal,
    cell: (projectId, employeeId) =>
      cells.get(cellKey(projectId, employeeId)) ?? null,
    projectTotal: (projectId) => projectTotals.get(projectId) ?? 0,
    employeeTotal: (employeeId) => employeeTotals.get(employeeId) ?? 0,
  };
}

/**
 * The projects that actually carry hours, in the order both reports print them.
 *
 * Ordered by client and then by project name, so report 1's client bands come
 * out contiguous without the builder having to sort again — and so report 5,
 * which does not band them, still lists a client's projects together. One
 * ordering serving both is what keeps the two documents recognisably the same
 * data.
 */
export function toReportedProjects(
  projects: readonly ReportProject[],
  rows: readonly ProjectEmployeeHourRow[],
): ReportProject[] {
  const withHours = new Set(rows.map((row) => row.projectId));

  return projects
    .filter((project) => withHours.has(project.id))
    .sort(
      (left, right) =>
        left.clientName.localeCompare(right.clientName) ||
        left.name.localeCompare(right.name),
    );
}

/** `projectId|employeeId` — the matrix key both lookups agree on. */
function cellKey(projectId: string, employeeId: string): string {
  return `${projectId}|${employeeId}`;
}

function add(current: number | undefined, hours: number): number {
  return (current ?? 0) + hours;
}

/**
 * Rounds a running total to the two decimals the `decimal(5, 2)` column stores.
 *
 * The stored values are exact; these sums are not, because they are doubles.
 * Without this a column of `2.4 + 2.4 + 3.2` would print `8.000000000000002`
 * in the spreadsheet and `8` in the PDF — which is precisely the preview/export
 * disagreement this architecture exists to make impossible. The same helper
 * `TimesheetFillService` applies for the same reason.
 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
