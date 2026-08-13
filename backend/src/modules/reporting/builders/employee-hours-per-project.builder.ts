import {
  ReportCell,
  ReportColumn,
  ReportDataModel,
  ReportPeriod,
  ReportRow,
} from '../entities/report-data-model.entity';
import { APPROVED_WORK_ONLY_NOTE } from '../reporting.constants';
import { ProjectEmployeeHours } from './project-employee-hours.aggregator';
import { average } from './project-hours-per-employee.builder';
import { hoursCell, textCell, toCells } from './report-cells';

const PROJECT_COLUMN = 'project';
const CLIENT_COLUMN = 'client';
const TOTAL_COLUMN = 'total';

/**
 * Report 5 — *Centralizator ore utilizator per proiect*.
 *
 * The **same matrix** as report 1, read the other way. Rows are projects and
 * columns are employees in both; what changes is that the client becomes an
 * ordinary column instead of a band, the employee columns are sub-labelled with
 * the employee code instead of the department, the emphasised total is the one
 * per employee, and the KPI strip gains an average per project.
 *
 * **This is not a transpose**, and calling it one was the first thing this
 * builder got wrong. A true transpose would put employees down the side and
 * projects across the top, which is a different document from the one the report
 * is specified as. The distinction that actually matters is which total a reader
 * is meant to land on: report 1 emphasises `Total Ore` per project — what did
 * this piece of work cost — and this one emphasises `Total per angajat` — what
 * did this person do with their month.
 *
 * Both reports are fed by {@link ProjectEmployeeHours}, computed once. The
 * reconciliation test asserts that their grand totals are equal and that each
 * equals both the sum of the per-project totals and the sum of the per-employee
 * totals — which is only a meaningful assertion because there is a single
 * aggregation underneath. Two builders each summing the rows themselves would
 * make the test tautological and the drift invisible.
 */
export function buildEmployeeHoursPerProject(
  period: ReportPeriod,
  generatedAt: string,
  hours: ProjectEmployeeHours,
): ReportDataModel {
  const { projects, employees } = hours;

  const columns: ReportColumn[] = [
    {
      key: PROJECT_COLUMN,
      label: 'Proiect',
      sublabel: null,
      type: 'text',
      isTotal: false,
    },
    {
      // The client as a column rather than a band — the visible difference from
      // report 1, and the reason this grid reads as a flat list.
      key: CLIENT_COLUMN,
      label: 'Client',
      sublabel: null,
      type: 'text',
      isTotal: false,
    },
    ...employees.map((employee): ReportColumn => ({
      key: employee.id,
      label: employee.fullName,
      // The employee code, where report 1 puts the department.
      sublabel: employee.employeeCode,
      type: 'number',
      isTotal: false,
    })),
    {
      key: TOTAL_COLUMN,
      label: 'Total',
      sublabel: null,
      type: 'number',
      isTotal: true,
    },
  ];

  const rows: ReportRow[] = projects.map((project): ReportRow => ({
    key: project.id,
    kind: 'data',
    label: project.name,
    badge: null,
    cells: toCells([
      [PROJECT_COLUMN, textCell(project.name)],
      [CLIENT_COLUMN, textCell(project.clientName)],
      ...employees.map((employee): readonly [string, ReportCell] => [
        employee.id,
        hoursCell(hours.cell(project.id, employee.id)),
      ]),
      [TOTAL_COLUMN, hoursCell(hours.projectTotal(project.id))],
    ]),
  }));

  rows.push({
    key: 'total',
    kind: 'total',
    label: 'Total per angajat',
    badge: null,
    cells: toCells([
      [PROJECT_COLUMN, textCell('Total per angajat')],
      [CLIENT_COLUMN, textCell(null)],
      ...employees.map((employee): readonly [string, ReportCell] => [
        employee.id,
        hoursCell(hours.employeeTotal(employee.id)),
      ]),
      [TOTAL_COLUMN, hoursCell(hours.grandTotal)],
    ]),
  });

  return {
    reportType: 'employee-hours-per-project',
    title: 'Employee hours per project',
    romanianTitle: 'Centralizator ore utilizator per proiect',
    subtitle: `Distribuirea orelor lucrate de ${String(employees.length)} angajați pe ${String(projects.length)} proiecte`,
    period,
    generatedAt,
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
        unit: 'ore lucrate',
      },
      {
        key: 'averageHoursPerEmployee',
        label: 'Medie / Angajat',
        value: average(hours.grandTotal, employees.length),
        unit: 'ore per angajat',
      },
      {
        // The fifth KPI, and the one report 1 does not carry: this document is
        // about how effort divided across the work, so "how big was an average
        // project this month" is a figure its reader wants and the other's does
        // not.
        key: 'averageHoursPerProject',
        label: 'Medie / Proiect',
        value: average(hours.grandTotal, projects.length),
        unit: 'ore per proiect',
      },
    ],
    columns,
    rows,
    legend: [],
  };
}
