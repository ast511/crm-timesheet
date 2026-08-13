import {
  ReportCell,
  ReportColumn,
  ReportDataModel,
  ReportPeriod,
  ReportRow,
} from '../entities/report-data-model.entity';
import { APPROVED_WORK_ONLY_NOTE } from '../reporting.constants';
import { ProjectEmployeeHours } from './project-employee-hours.aggregator';
import { clientBadge, hoursCell, textCell, toCells } from './report-cells';

/** The two identity columns before the employee columns begin. */
const PROJECT_NAME_COLUMN = 'projectName';
const PROJECT_CODE_COLUMN = 'projectCode';
const TOTAL_COLUMN = 'total';

/**
 * Report 1 — *Centralizator ore proiect per angajat*.
 *
 * Rows are projects, **banded under their client**; columns are employees; the
 * last column is the project's total across everybody, and the last row is the
 * grand total per employee.
 *
 * **It is not the transpose of report 5, and neither is report 5 of it.** Both
 * put projects down the side and people across the top, over the identical
 * matrix from {@link ProjectEmployeeHours}. What differs is the *orientation of
 * the reading*:
 *
 * | | This report | Report 5 |
 * | --- | --- | --- |
 * | Rows | projects, banded under each client | projects, flat |
 * | Client | a full-width group band | an ordinary column |
 * | Identity columns | name and project code | name and client |
 * | Employee sub-label | their department | their employee code |
 * | Emphasis | `Total Ore` per project | `Total per angajat` |
 * | KPIs | four | five — average per project as well |
 *
 * This one is read **across**: what did this project cost, and who worked on it.
 * Report 5 is read **down**: what did this person do, and where did it go. Same
 * numbers, and the reconciliation test asserts exactly that.
 *
 * A builder is a **pure function of resolved inputs**. It performs no query,
 * reads no clock and produces no file — it returns the data model that the JSON
 * response *is* and that the two renderers format. That is what makes the
 * preview and both exports incapable of disagreeing.
 */
export function buildProjectHoursPerEmployee(
  period: ReportPeriod,
  generatedAt: string,
  hours: ProjectEmployeeHours,
): ReportDataModel {
  const { projects, employees } = hours;

  const columns: ReportColumn[] = [
    {
      key: PROJECT_NAME_COLUMN,
      label: 'Nume Proiect',
      sublabel: null,
      type: 'text',
      isTotal: false,
    },
    {
      key: PROJECT_CODE_COLUMN,
      label: 'COD Proiect',
      sublabel: null,
      type: 'text',
      isTotal: false,
    },
    // Deliberately no "COD Subproiect" column, although the mock-ups carry one:
    // this application has no sub-project, and a column that could only ever be
    // empty is a column that invites somebody to fill it.
    ...employees.map((employee): ReportColumn => ({
      key: employee.id,
      label: employee.fullName,
      // The department, which is this report's way of grouping the people
      // across the top — report 5 uses the employee code instead.
      sublabel: employee.departmentCode,
      type: 'number',
      isTotal: false,
    })),
    {
      key: TOTAL_COLUMN,
      label: 'Total Ore',
      sublabel: null,
      type: 'number',
      isTotal: true,
    },
  ];

  const rows: ReportRow[] = [];
  let currentClient: string | null = null;

  for (const project of projects) {
    // The projects arrive ordered by client then name, so a band is emitted
    // whenever the client changes and the grouping needs no second pass.
    if (project.clientName !== currentClient) {
      currentClient = project.clientName;

      rows.push({
        key: `client:${project.clientName}`,
        kind: 'group',
        label: project.clientName,
        badge: clientBadge(project.clientName),
        cells: {},
      });
    }

    rows.push({
      key: project.id,
      kind: 'data',
      label: project.name,
      badge: null,
      cells: toCells([
        [PROJECT_NAME_COLUMN, textCell(project.name)],
        [PROJECT_CODE_COLUMN, textCell(project.code)],
        ...employees.map((employee): readonly [string, ReportCell] => [
          employee.id,
          hoursCell(hours.cell(project.id, employee.id)),
        ]),
        [TOTAL_COLUMN, hoursCell(hours.projectTotal(project.id))],
      ]),
    });
  }

  rows.push({
    key: 'total',
    kind: 'total',
    label: 'TOTAL GENERAL',
    badge: null,
    cells: toCells([
      [PROJECT_NAME_COLUMN, textCell('TOTAL GENERAL')],
      [PROJECT_CODE_COLUMN, textCell(null)],
      ...employees.map((employee): readonly [string, ReportCell] => [
        employee.id,
        hoursCell(hours.employeeTotal(employee.id)),
      ]),
      [TOTAL_COLUMN, hoursCell(hours.grandTotal)],
    ]),
  });

  return {
    reportType: 'project-hours-per-employee',
    title: 'Project hours per employee',
    romanianTitle: 'Centralizator ore proiect per angajat',
    subtitle: `Distribuirea orelor lucrate pe proiecte pentru ${String(employees.length)} angajați`,
    period,
    generatedAt,
    // Landscape: one column per employee makes this the widest kind of grid the
    // feature produces, and portrait would break every month across two pages.
    orientation: 'landscape',
    sourceNote: APPROVED_WORK_ONLY_NOTE,
    kpis: [
      {
        key: 'totalEmployees',
        label: 'Total Angajați',
        value: employees.length,
        unit: 'angajați',
      },
      {
        key: 'totalProjects',
        label: 'Total Proiecte',
        value: projects.length,
        unit: 'proiecte',
      },
      {
        key: 'totalHours',
        label: 'Total Ore',
        value: hours.grandTotal,
        unit: 'ore',
      },
      {
        key: 'averageHoursPerEmployee',
        label: 'Medie Ore/Angajat',
        value: average(hours.grandTotal, employees.length),
        unit: 'ore per angajat',
      },
    ],
    columns,
    rows,
    // No markers in this grid, so no legend. A renderer reads the empty array as
    // "draw no legend box" rather than having to know which reports have one.
    legend: [],
  };
}

/**
 * A mean that answers `0` rather than `NaN` for an empty population.
 *
 * Shared with report 5 through the module below rather than written twice, since
 * the two KPI strips overlap. `NaN` would reach the JSON response as `null` and
 * the spreadsheet as `#DIV/0!`, which is two different wrong answers to the same
 * question from the same model — precisely what this architecture exists to
 * prevent.
 */
export function average(total: number, count: number): number {
  return count === 0 ? 0 : Math.round((total / count) * 100) / 100;
}
