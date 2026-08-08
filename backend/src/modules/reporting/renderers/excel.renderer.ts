import { Injectable } from '@nestjs/common';
import { Workbook, Worksheet } from 'exceljs';

import { toZonedTimestamp } from '../../../common/utils/date.util';
import { REPORT_LOCALE } from '../reporting.constants';
import { ReportCell, ReportDataModel, ReportRow } from './report-data-model';

/** How many header rows the grid carries: labels, then sub-labels. */
const HEADER_ROWS = 2;

/**
 * Renders a report data model into an `.xlsx` workbook, in memory.
 *
 * **It formats and it does not compute.** Every number it writes came out of a
 * builder; there is no `SUM` here, no re-sorting, no filtering, and no branch on
 * which report is being drawn beyond the layout hints the model already carries.
 * That is what makes the preview and this export incapable of disagreeing — the
 * parity test posts one model at both and compares the numbers.
 *
 * ExcelJS was chosen over the alternatives because it is the only maintained
 * library in this ecosystem that writes a **real** `xlsx` — typed cells, frozen
 * panes, column widths, merged ranges — to a buffer rather than to a file
 * handle. The lighter CSV-shaped writers cannot express a frozen header or a
 * numeric cell, and both matter here: a spreadsheet whose hour cells are strings
 * looks correct and silently returns zero from `SUM`, which is the worst failure
 * this feature could ship.
 *
 * **Nothing touches the disk.** `writeBuffer()` returns the whole workbook in
 * memory and the controller streams it; no temporary file is created, so nothing
 * has to be cleaned up and a crashed request leaves nothing behind.
 */
@Injectable()
export class ExcelReportRenderer {
  async render(model: ReportDataModel): Promise<Buffer> {
    const workbook = new Workbook();

    workbook.creator = 'CRM TimeSheet';
    workbook.created = new Date(model.generatedAt);

    const sheet = workbook.addWorksheet(toSheetName(model), {
      views: [
        {
          // Freezes the two header rows and the first column, so scrolling a
          // 31-day grid keeps both the dates and the names in view. It is the
          // single thing that makes these grids usable at all.
          state: 'frozen',
          xSplit: 1,
          ySplit: HEADER_ROWS,
        },
      ],
      pageSetup: {
        orientation: model.orientation,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });

    this.writeTitle(sheet, model);
    this.writeKpis(sheet, model);
    this.writeHeader(sheet, model);
    this.writeRows(sheet, model);
    this.writeLegend(sheet, model);
    this.applyWidths(sheet, model);

    // ExcelJS declares its own `Buffer` as an `ArrayBuffer`, which is not Node's
    // `Buffer`. Copying through `Buffer.from` is the honest conversion — a cast
    // would compile and then hand the controller an object without `subarray`,
    // which is what a stream needs.
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** The title block above the grid: both names, the period and the source. */
  private writeTitle(sheet: Worksheet, model: ReportDataModel): void {
    sheet.addRow([model.romanianTitle]).font = { bold: true, size: 14 };
    sheet.addRow([model.title]).font = { italic: true, size: 10 };
    sheet.addRow([model.subtitle]);
    sheet.addRow([`Perioadă: ${model.period.label}`]);
    // Printed on the export as well as the preview, because a downloaded file
    // outlives the screen it came from and a reader has to be able to tell which
    // timesheets it counted.
    sheet.addRow([model.sourceNote]);
    // Rendered in the company's zone and the document's language, never printed
    // as the raw ISO string. `generatedAt` is an instant, so
    // `…T18:28:03Z (Europe/Bucharest)` would state the UTC time under a label
    // three hours ahead of it — wrong by exactly the offset for the person
    // checking it against their own clock.
    sheet.addRow([
      `Generat: ${toZonedTimestamp(
        new Date(model.generatedAt),
        model.period.timezone,
        REPORT_LOCALE,
      )} (${model.period.timezone})`,
    ]).font = { size: 9 };
    sheet.addRow([]);
  }

  /** The KPI strip, one label/value pair per row. */
  private writeKpis(sheet: Worksheet, model: ReportDataModel): void {
    for (const kpi of model.kpis) {
      const row = sheet.addRow([kpi.label, kpi.value, kpi.unit]);

      row.getCell(1).font = { bold: true };
      // Written as a number rather than as text, so a reader can reuse it.
      row.getCell(2).numFmt = '0.##';
    }

    sheet.addRow([]);
  }

  /**
   * The two header rows.
   *
   * Two rather than one because several reports carry a sub-label — a
   * department, an employee code, a leave type's full name under its marker —
   * and folding it into the label would produce a header cell too wide for a
   * one-character column.
   */
  private writeHeader(sheet: Worksheet, model: ReportDataModel): void {
    const labels = sheet.addRow(model.columns.map((column) => column.label));
    const sublabels = sheet.addRow(
      model.columns.map((column) => column.sublabel ?? ''),
    );

    labels.font = { bold: true };
    sublabels.font = { size: 9, italic: true };
  }

  private writeRows(sheet: Worksheet, model: ReportDataModel): void {
    for (const row of model.rows) {
      this.writeRow(sheet, model, row);
    }
  }

  /**
   * One row, with its kind expressed as formatting rather than as content.
   *
   * A `group` band writes its badge and label in the first cell and leaves the
   * rest empty; a `total` row is bold. Neither is re-derived — the builder
   * already decided which is which and in what order they appear.
   */
  private writeRow(
    sheet: Worksheet,
    model: ReportDataModel,
    row: ReportRow,
  ): void {
    if (row.kind === 'group') {
      const band = sheet.addRow([
        row.badge === null ? row.label : `${row.badge}  ${row.label}`,
      ]);

      band.font = { bold: true };

      return;
    }

    const written = sheet.addRow(
      model.columns.map((column) => toExcelValue(row.cells[column.key])),
    );

    if (row.kind === 'total') {
      written.font = { bold: true };
    }

    // Hour cells carry a newline in the attendance sheet (`09:00-18:00\n8h`);
    // without wrapping, Excel shows one line and hides the other.
    written.alignment = { wrapText: true, vertical: 'middle' };
  }

  /** The legend, when the grid uses markers. */
  private writeLegend(sheet: Worksheet, model: ReportDataModel): void {
    if (model.legend.length === 0) {
      return;
    }

    sheet.addRow([]);
    sheet.addRow(['Legendă']).font = { bold: true };

    for (const item of model.legend) {
      sheet.addRow([item.marker, item.label]);
    }
  }

  /**
   * Column widths, wide enough for the first column and narrow for day columns.
   *
   * Derived from the column type rather than measured: a `marker` column holds at
   * most three characters and a `text` column holds a person's name, so two
   * numbers cover every report and nothing has to iterate the cells.
   */
  private applyWidths(sheet: Worksheet, model: ReportDataModel): void {
    model.columns.forEach((column, index) => {
      sheet.getColumn(index + 1).width =
        column.type === 'marker' ? 6 : column.type === 'number' ? 12 : 28;
    });
  }
}

/**
 * One cell's machine value.
 *
 * **This is where numbers stay numbers.** A `number` cell writes its `value`, so
 * the column can be summed and sorted in the spreadsheet; a `marker` cell writes
 * its marker; a `text` cell writes its text. The `text` property of a number
 * cell — `140h` — is the PDF's business and is deliberately not used here:
 * writing it would make every hour column text and quietly break `SUM`.
 */
function toExcelValue(cell: ReportCell | undefined): string | number | null {
  if (cell === undefined) {
    return null;
  }

  switch (cell.kind) {
    case 'number':
      return cell.value;
    case 'marker':
      return cell.marker;
    case 'text':
      return cell.text;
  }
}

/**
 * The worksheet's name.
 *
 * Excel forbids `\ / ? * [ ]` in a sheet name and truncates past 31 characters,
 * so the English title is stripped and cut rather than passed through — an
 * invalid name is a workbook Excel refuses to open, which would look like a
 * corrupt download.
 */
function toSheetName(model: ReportDataModel): string {
  return `${model.title} ${model.period.key}`
    .replace(/[\\/?*[\]:]/g, '-')
    .slice(0, 31);
}
