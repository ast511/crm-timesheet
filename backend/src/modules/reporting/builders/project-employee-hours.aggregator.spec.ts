import {
  ReportDataModel,
  ReportNumberCell,
} from '../renderers/report-data-model';
import { ReportPeriod } from '../renderers/report-data-model';
import { ReportEmployee, ReportProject } from '../reporting.types';
import { buildEmployeeHoursPerProject } from './employee-hours-per-project.builder';
import {
  toProjectEmployeeHours,
  toReportedProjects,
} from './project-employee-hours.aggregator';
import { buildProjectHoursPerEmployee } from './project-hours-per-employee.builder';

const PERIOD: ReportPeriod = {
  month: 9,
  year: 2026,
  label: 'September 2026',
  key: '2026-09',
  timezone: 'Europe/Bucharest',
};

const GENERATED_AT = '2026-10-01T08:00:00.000Z';

function employee(id: string, lastName: string): ReportEmployee {
  return {
    id,
    employeeCode: `EMP-${id}`,
    firstName: 'Test',
    lastName,
    fullName: `Test ${lastName}`,
    departmentCode: 'DEV',
    departmentName: 'Development',
    positionName: 'Developer',
    hireDate: new Date('2020-01-01T00:00:00.000Z'),
    terminationDate: null,
  };
}

function project(id: string, clientName: string): ReportProject {
  return { id, code: `P-${id}`, name: `Project ${id}`, clientName };
}

const EMPLOYEES = [employee('e1', 'Popescu'), employee('e2', 'Ionescu')];

const PROJECTS = [
  project('p1', 'Acme'),
  project('p2', 'Acme'),
  project('p3', 'Globex'),
];

const ROWS = [
  { projectId: 'p1', employeeId: 'e1', hours: 10 },
  { projectId: 'p1', employeeId: 'e2', hours: 5.5 },
  { projectId: 'p2', employeeId: 'e1', hours: 4.25 },
  { projectId: 'p3', employeeId: 'e2', hours: 8 },
];

/** The number in a cell, whatever kind of cell it is. */
function cellValue(model: ReportDataModel, rowKey: string, columnKey: string) {
  const cell = model.rows.find((row) => row.key === rowKey)?.cells[columnKey];

  return cell === undefined ? undefined : (cell as ReportNumberCell).value;
}

describe('project × employee aggregation', () => {
  const hours = toProjectEmployeeHours(
    toReportedProjects(PROJECTS, ROWS),
    EMPLOYEES,
    ROWS,
  );

  it('places each pair in its own cell', () => {
    expect(hours.cell('p1', 'e1')).toBe(10);
    expect(hours.cell('p1', 'e2')).toBe(5.5);
    expect(hours.cell('p2', 'e1')).toBe(4.25);
  });

  /**
   * `null` and `0` are different: a project somebody never touched prints a dash,
   * and collapsing it to zero would claim they booked no hours to work they were
   * never assigned.
   */
  it('answers null for a pair with no hours, not zero', () => {
    expect(hours.cell('p2', 'e2')).toBeNull();
  });

  it('sums several rows for the same pair rather than overwriting', () => {
    const summed = toProjectEmployeeHours(PROJECTS, EMPLOYEES, [
      { projectId: 'p1', employeeId: 'e1', hours: 3 },
      { projectId: 'p1', employeeId: 'e1', hours: 4 },
    ]);

    expect(summed.cell('p1', 'e1')).toBe(7);
  });

  it('drops projects with no hours from the rows', () => {
    const reported = toReportedProjects(
      [...PROJECTS, project('p9', 'Unused Co')],
      ROWS,
    );

    expect(reported.map(({ id }) => id)).not.toContain('p9');
  });

  /**
   * The employee axis is the population being reported on, so somebody who
   * logged nothing keeps a column of dashes and a total of zero. Dropping them
   * would make "Maria booked no hours" — which is the finding — invisible.
   */
  it('keeps an employee with no hours at all', () => {
    const withIdle = toProjectEmployeeHours(
      toReportedProjects(PROJECTS, ROWS),
      [...EMPLOYEES, employee('e3', 'Idle')],
      ROWS,
    );

    expect(withIdle.employees).toHaveLength(3);
    expect(withIdle.employeeTotal('e3')).toBe(0);
  });

  it('rounds to the two decimals the column stores', () => {
    const drifting = toProjectEmployeeHours(PROJECTS, EMPLOYEES, [
      { projectId: 'p1', employeeId: 'e1', hours: 2.4 },
      { projectId: 'p1', employeeId: 'e1', hours: 2.4 },
      { projectId: 'p1', employeeId: 'e1', hours: 3.2 },
    ]);

    expect(drifting.cell('p1', 'e1')).toBe(8);
  });

  describe('totals reconcile', () => {
    it('sums the per-project totals to the grand total', () => {
      const summed = hours.projects.reduce(
        (total, current) => total + hours.projectTotal(current.id),
        0,
      );

      expect(summed).toBe(hours.grandTotal);
    });

    it('sums the per-employee totals to the grand total', () => {
      const summed = hours.employees.reduce(
        (total, current) => total + hours.employeeTotal(current.id),
        0,
      );

      expect(summed).toBe(hours.grandTotal);
    });

    it('sums the cells to the grand total', () => {
      const summed = hours.projects.reduce(
        (total, current) =>
          total +
          hours.employees.reduce(
            (rowTotal, person) =>
              rowTotal + (hours.cell(current.id, person.id) ?? 0),
            0,
          ),
        0,
      );

      expect(summed).toBe(hours.grandTotal);
    });
  });
});

/**
 * The pair of reports built from one aggregation.
 *
 * These are the assertions that make "aggregate once" worth doing: the two
 * documents are checked against each other, not each against its own arithmetic.
 */
describe('reports 1 and 5 agree', () => {
  const hours = toProjectEmployeeHours(
    toReportedProjects(PROJECTS, ROWS),
    EMPLOYEES,
    ROWS,
  );

  const report1 = buildProjectHoursPerEmployee(PERIOD, GENERATED_AT, hours);
  const report5 = buildEmployeeHoursPerProject(PERIOD, GENERATED_AT, hours);

  it('reports the same grand total', () => {
    const total1 = cellValue(report1, 'total', 'total');
    const total5 = cellValue(report5, 'total', 'total');

    expect(total1).toBe(hours.grandTotal);
    expect(total5).toBe(hours.grandTotal);
  });

  it('reports the same total hours KPI', () => {
    const kpi = (model: ReportDataModel) =>
      model.kpis.find((item) => item.key === 'totalHours')?.value;

    expect(kpi(report1)).toBe(kpi(report5));
  });

  it('reports the same per-project totals', () => {
    for (const current of hours.projects) {
      expect(cellValue(report1, current.id, 'total')).toBe(
        cellValue(report5, current.id, 'total'),
      );
    }
  });

  it('reports the same per-employee totals', () => {
    for (const person of EMPLOYEES) {
      expect(cellValue(report1, 'total', person.id)).toBe(
        cellValue(report5, 'total', person.id),
      );
    }
  });

  it('reports the same cell for every pair', () => {
    for (const current of hours.projects) {
      for (const person of EMPLOYEES) {
        expect(cellValue(report1, current.id, person.id)).toBe(
          cellValue(report5, current.id, person.id),
        );
      }
    }
  });

  /**
   * The user's correction, pinned as a test. Report 5 is **not** a transpose:
   * both reports put projects down the side and employees across the top, and
   * what differs is the presentation and which total is emphasised.
   */
  describe('and differ only in presentation', () => {
    it('both put projects in rows and employees in columns', () => {
      const dataRows = (model: ReportDataModel) =>
        model.rows.filter((row) => row.kind === 'data').map((row) => row.key);

      expect(dataRows(report1)).toEqual(hours.projects.map(({ id }) => id));
      expect(dataRows(report5)).toEqual(hours.projects.map(({ id }) => id));

      for (const person of EMPLOYEES) {
        expect(report1.columns.some((column) => column.key === person.id)).toBe(
          true,
        );
        expect(report5.columns.some((column) => column.key === person.id)).toBe(
          true,
        );
      }
    });

    /** Report 1 bands its projects under the client; report 5 does not. */
    it('bands report 1 by client and leaves report 5 flat', () => {
      expect(report1.rows.filter((row) => row.kind === 'group')).toHaveLength(
        2,
      );
      expect(report5.rows.filter((row) => row.kind === 'group')).toHaveLength(
        0,
      );
      expect(report5.columns.some((column) => column.key === 'client')).toBe(
        true,
      );
    });

    it('sub-labels the employee columns differently', () => {
      const sublabel = (model: ReportDataModel, key: string) =>
        model.columns.find((column) => column.key === key)?.sublabel;

      expect(sublabel(report1, 'e1')).toBe('DEV');
      expect(sublabel(report5, 'e1')).toBe('EMP-e1');
    });

    it('emphasises a different total row', () => {
      const totalRow = (model: ReportDataModel) =>
        model.rows.find((row) => row.kind === 'total')?.label;

      expect(totalRow(report1)).toBe('TOTAL GENERAL');
      expect(totalRow(report5)).toBe('Total per angajat');
    });

    /** Report 5 carries the fifth KPI; report 1 does not. */
    it('gives report 5 an average per project', () => {
      const keys = (model: ReportDataModel) =>
        model.kpis.map((item) => item.key);

      expect(keys(report1)).not.toContain('averageHoursPerProject');
      expect(keys(report5)).toContain('averageHoursPerProject');
    });
  });

  /** The mock-ups show one; this application has no sub-project. */
  it('prints no "COD Subproiect" column', () => {
    expect(
      report1.columns.some((column) =>
        column.label.toLowerCase().includes('subproiect'),
      ),
    ).toBe(false);
  });
});
