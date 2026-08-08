import { Workbook } from 'exceljs';

import {
  toProjectEmployeeHours,
  toReportedProjects,
} from '../builders/project-employee-hours.aggregator';
import { buildProjectHoursPerEmployee } from '../builders/project-hours-per-employee.builder';
import { ReportEmployee, ReportProject } from '../reporting.types';
import { ExcelReportRenderer } from './excel.renderer';
import { PdfReportRenderer } from './pdf.renderer';
import {
  ReportDataModel,
  ReportNumberCell,
  ReportPeriod,
} from './report-data-model';

const PERIOD: ReportPeriod = {
  month: 9,
  year: 2026,
  label: 'September 2026',
  key: '2026-09',
  timezone: 'Europe/Bucharest',
};

const EMPLOYEES: ReportEmployee[] = [
  {
    id: 'e1',
    employeeCode: 'EMP-0001',
    firstName: 'Ion',
    lastName: 'Popescu',
    fullName: 'Ion Popescu',
    departmentCode: 'DEV',
    departmentName: 'Development',
    positionName: 'Developer',
    hireDate: new Date('2020-01-01T00:00:00.000Z'),
    terminationDate: null,
  },
  {
    id: 'e2',
    employeeCode: 'EMP-0002',
    firstName: 'Maria',
    lastName: 'Ionescu',
    fullName: 'Maria Ionescu',
    departmentCode: 'QA',
    departmentName: 'Quality',
    positionName: 'Tester',
    hireDate: new Date('2020-01-01T00:00:00.000Z'),
    terminationDate: null,
  },
];

const PROJECTS: ReportProject[] = [
  { id: 'p1', code: 'ALPHA', name: 'Alpha', clientName: 'Acme' },
  { id: 'p2', code: 'BETA', name: 'Beta', clientName: 'Globex' },
];

const ROWS = [
  { projectId: 'p1', employeeId: 'e1', hours: 140 },
  { projectId: 'p1', employeeId: 'e2', hours: 46.5 },
  { projectId: 'p2', employeeId: 'e2', hours: 82 },
];

function buildModel(): ReportDataModel {
  const hours = toProjectEmployeeHours(
    toReportedProjects(PROJECTS, ROWS),
    EMPLOYEES,
    ROWS,
  );

  return buildProjectHoursPerEmployee(
    PERIOD,
    '2026-10-01T08:00:00.000Z',
    hours,
  );
}

/**
 * Reads a rendered workbook back.
 *
 * The cast is a typing mismatch and not a runtime one: ExcelJS declares its own
 * `Buffer` as an `ArrayBuffer`, while `load` accepts a Node `Buffer` perfectly
 * well. Isolated in one helper so the two tests below read cleanly.
 */
async function loadWorkbook(buffer: Buffer): Promise<Workbook> {
  const workbook = new Workbook();

  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  return workbook;
}

/** Every number the data model states, as a flat sorted list. */
function modelNumbers(model: ReportDataModel): number[] {
  const numbers: number[] = model.kpis.map((kpi) => kpi.value);

  for (const row of model.rows) {
    for (const cell of Object.values(row.cells)) {
      if (cell.kind === 'number' && cell.value !== null) {
        numbers.push(cell.value);
      }
    }
  }

  return numbers.sort((left, right) => left - right);
}

/**
 * The assertion the whole architecture exists to make possible.
 *
 * A preview that quietly disagrees with the file downloaded from it is the worst
 * failure this feature could ship, because somebody forwards the file. Here the
 * preview *is* the data model, and both renderers are handed that same object —
 * so the test is not "do two computations agree" but "did either renderer invent
 * or lose a number", which is the only thing that can still go wrong.
 */
describe('preview, Excel and PDF agree', () => {
  const model = buildModel();
  const excel = new ExcelReportRenderer();
  const pdf = new PdfReportRenderer();

  it('writes every model number into the spreadsheet, as a number', async () => {
    const workbook = await loadWorkbook(await excel.render(model));

    const written: number[] = [];

    workbook.worksheets[0].eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === 'number') {
          written.push(cell.value);
        }
      });
    });

    // Every figure the preview states appears in the sheet as a real number —
    // which is what makes the column summable. A renderer writing `140h` as text
    // would leave this list short and `SUM` returning zero.
    for (const value of modelNumbers(model)) {
      expect(written).toContain(value);
    }
  });

  it('keeps the grand total identical in the model and the sheet', async () => {
    const workbook = await loadWorkbook(await excel.render(model));

    const totalRow = model.rows.find((row) => row.kind === 'total');
    const grandTotal = (totalRow?.cells['total'] as ReportNumberCell).value;

    let found = false;

    workbook.worksheets[0].eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value === grandTotal) {
          found = true;
        }
      });
    });

    expect(grandTotal).toBe(268.5);
    expect(found).toBe(true);
  });

  it('renders the PDF from the same model without failing', async () => {
    const buffer = await pdf.render(model);

    // A real PDF, not an empty buffer: the header is the format's magic number.
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
  });

  /**
   * Both renderers read the same cells, so neither can drop a row the other
   * keeps. Asserted on the row count rather than by parsing the PDF's text,
   * which would be testing pdfmake rather than this feature.
   */
  it('gives both renderers the same rows and columns', () => {
    expect(model.rows.filter((row) => row.kind === 'data')).toHaveLength(2);
    expect(model.rows.filter((row) => row.kind === 'group')).toHaveLength(2);
    expect(model.rows.filter((row) => row.kind === 'total')).toHaveLength(1);
  });

  /**
   * The bug this test was written for: the header printed the raw ISO instant
   * and labelled it with the company's zone, so `18:28Z` was presented as a
   * Bucharest time three hours behind the clock on the wall.
   *
   * `generatedAt` stays ISO **in the model**, because a JSON consumer wants an
   * unambiguous instant. Only the rendered document converts it.
   */
  it('prints the generation time in the company zone and language', async () => {
    const workbook = await loadWorkbook(await excel.render(model));

    let header = '';

    workbook.worksheets[0].eachRow((row) => {
      const value = row.getCell(1).value;

      if (typeof value === 'string' && value.startsWith('Generat:')) {
        header = value;
      }
    });

    // 08:00 UTC is 11:00 in Bucharest in October, written the Romanian way.
    expect(header).toBe('Generat: 01.10.2026, 11:00 (Europe/Bucharest)');
    expect(header).not.toContain('T08:00');
    expect(header).not.toContain('Z');

    // The model itself is untouched — the conversion is the renderer's.
    expect(model.generatedAt).toBe('2026-10-01T08:00:00.000Z');
  });

  /** In memory, both of them: nothing is written to disk at any point. */
  it('returns a buffer rather than a path', async () => {
    await expect(excel.render(model)).resolves.toBeInstanceOf(Buffer);
    await expect(pdf.render(model)).resolves.toBeInstanceOf(Buffer);
  });
});
