import { Injectable } from '@nestjs/common';
import { dirname, join } from 'path';
// A default import, and it has to be this one of the three. `pdfmake`'s Node
// entry point ends in `module.exports = new pdfmake()` — the module *is* a class
// instance — so `import { setFonts }` detaches the method from its receiver and
// fails on `this.fonts`, while `import * as` is compiled to `__importStar`,
// which copies own properties and leaves the prototype's methods behind. The
// default import resolves to the instance itself, methods and all.
import pdfmake from 'pdfmake';
import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';

import { toZonedTimestamp } from '../../../common/utils/date.util';
import { REPORT_LOCALE } from '../reporting.constants';
import {
  ReportCell,
  ReportDataModel,
  ReportRow,
} from '../entities/report-data-model.entity';

/**
 * Where pdfmake keeps the Roboto files it ships.
 *
 * Resolved through `require.resolve` rather than written as a `node_modules`
 * path, so it keeps working under pnpm, under a hoisted install and inside a
 * bundle — three layouts that put the package in three different places.
 *
 * **Roboto rather than the PDF standard-14 fonts, and this is not cosmetic.**
 * Helvetica and its siblings are encoded in WinAnsi, which is Latin-1: it has no
 * `ă`, no `ș` and no `ț`. Every one of these reports has a Romanian title —
 * *Foaie colectivă de prezență* — and half of them carry Romanian column
 * headings, so a standard font would silently drop or mangle the diacritics in
 * the one place a reader looks first. Roboto is a TrueType face with Latin
 * Extended-A, it is already in the dependency tree, and embedding it costs a few
 * hundred kilobytes per document.
 */
const ROBOTO_DIRECTORY = join(
  dirname(require.resolve('pdfmake/package.json')),
  'fonts',
  'Roboto',
);

/** Registered once at module load; `setFonts` is global to pdfmake. */
pdfmake.setFonts({
  Roboto: {
    normal: join(ROBOTO_DIRECTORY, 'Roboto-Regular.ttf'),
    bold: join(ROBOTO_DIRECTORY, 'Roboto-Medium.ttf'),
    italics: join(ROBOTO_DIRECTORY, 'Roboto-Italic.ttf'),
    bolditalics: join(ROBOTO_DIRECTORY, 'Roboto-MediumItalic.ttf'),
  },
});

/** Point sizes, in one place so the five reports look like one family. */
const FONT_SIZE = { title: 16, subtitle: 9, cell: 7, header: 7, legend: 8 };

/**
 * Renders a report data model into a PDF, in memory.
 *
 * **It formats and it does not compute** — the same contract the Excel renderer
 * keeps, and the reason the two can never disagree with each other or with the
 * preview. Every figure it prints came out of a builder; this file decides page
 * size, column widths and where a page may break, and nothing else.
 *
 * pdfmake was chosen over pdfkit, which was the other candidate. Both write to a
 * buffer and neither touches the disk, so the difference is the layout model:
 * pdfmake is declarative — a table is a table, with header rows that repeat and
 * rows that are not split across a page boundary — while pdfkit is an imperative
 * cursor that would have meant measuring text, tracking a y-position and
 * implementing page breaks by hand in this file. For five fixed grid layouts,
 * three of which are 31 columns wide, that is the whole job.
 *
 * **Nothing is written to disk.** `getBuffer()` resolves with the document in
 * memory and the controller streams it; no temporary file exists at any point,
 * so a failed request leaves nothing to clean up.
 */
@Injectable()
export class PdfReportRenderer {
  async render(model: ReportDataModel): Promise<Buffer> {
    return pdfmake.createPdf(this.toDocument(model)).getBuffer();
  }

  private toDocument(model: ReportDataModel): TDocumentDefinitions {
    return {
      // Landscape for the four grid reports, portrait for the status summary.
      // Taken from the model rather than decided here — see `orientation`.
      pageOrientation: model.orientation,
      pageSize: 'A4',
      pageMargins: [20, 24, 20, 28],
      defaultStyle: { font: 'Roboto', fontSize: FONT_SIZE.cell },
      content: [
        ...this.buildTitle(model),
        ...this.buildKpis(model),
        this.buildTable(model),
        ...this.buildLegend(model),
      ],
      footer: (currentPage: number, pageCount: number): Content => ({
        text: `${model.romanianTitle} — ${model.period.label} — ${String(currentPage)} / ${String(pageCount)}`,
        alignment: 'center',
        fontSize: FONT_SIZE.subtitle,
        margin: [0, 8, 0, 0],
      }),
    };
  }

  private buildTitle(model: ReportDataModel): Content[] {
    return [
      { text: model.romanianTitle, bold: true, fontSize: FONT_SIZE.title },
      {
        text: `${model.title} — ${model.period.label}`,
        fontSize: FONT_SIZE.subtitle,
        margin: [0, 2, 0, 0],
      },
      { text: model.subtitle, fontSize: FONT_SIZE.subtitle },
      {
        // The PDF printed no generation time at all until the Excel export was
        // found stating one in UTC under a Bucharest label. A document that
        // outlives the screen it came from should say when it was produced, and
        // both renderers should say it the same way.
        text: `Generat: ${toZonedTimestamp(
          new Date(model.generatedAt),
          model.period.timezone,
          REPORT_LOCALE,
        )} (${model.period.timezone})`,
        fontSize: FONT_SIZE.subtitle,
      },
      {
        // On the document itself, because a PDF outlives the screen it was
        // downloaded from and a reader has to be able to tell which timesheets
        // it counted without going back to the application.
        text: model.sourceNote,
        fontSize: FONT_SIZE.subtitle,
        italics: true,
        margin: [0, 4, 0, 8],
      },
    ];
  }

  /** The KPI strip, as a single borderless row of label/value pairs. */
  private buildKpis(model: ReportDataModel): Content[] {
    if (model.kpis.length === 0) {
      return [];
    }

    return [
      {
        columns: model.kpis.map((kpi) => ({
          stack: [
            { text: kpi.label, fontSize: FONT_SIZE.subtitle },
            { text: formatNumber(kpi.value), bold: true, fontSize: 13 },
            { text: kpi.unit, fontSize: FONT_SIZE.subtitle },
          ],
        })),
        margin: [0, 0, 0, 10],
      },
    ];
  }

  /**
   * The grid.
   *
   * Two properties matter and both are the reason this library was chosen:
   *
   * - **`headerRows: 2`** repeats the label and sub-label rows at the top of
   *   every page, so page four of an attendance sheet still says which day each
   *   column is.
   * - **`dontBreakRows: true`** keeps a row whole. Without it a 31-column row can
   *   be split down the middle by a page boundary, putting somebody's first
   *   fortnight on one page and the rest on the next with no name against it.
   */
  private buildTable(model: ReportDataModel): Content {
    const body: TableCell[][] = [
      model.columns.map((column) => ({
        text: column.label,
        bold: true,
        fontSize: FONT_SIZE.header,
      })),
      model.columns.map((column) => ({
        text: column.sublabel ?? '',
        fontSize: FONT_SIZE.header - 1,
        italics: true,
      })),
      ...model.rows.map((row) => this.buildRow(model, row)),
    ];

    return {
      table: {
        headerRows: 2,
        dontBreakRows: true,
        widths: model.columns.map((column) =>
          column.type === 'marker' ? 14 : column.type === 'number' ? 34 : '*',
        ),
        body,
      },
      layout: 'lightHorizontalLines',
    };
  }

  private buildRow(model: ReportDataModel, row: ReportRow): TableCell[] {
    if (row.kind === 'group') {
      // A full-width band. `colSpan` needs the spanned cells to be present but
      // empty, which is pdfmake's contract rather than a quirk of this code.
      return [
        {
          text: row.badge === null ? row.label : `${row.badge}  ${row.label}`,
          bold: true,
          colSpan: model.columns.length,
          fillColor: '#EEEEEE',
        },
        ...Array.from({ length: model.columns.length - 1 }, () => ({
          text: '',
        })),
      ];
    }

    return model.columns.map((column) => ({
      text: toPdfText(row.cells[column.key]),
      bold: row.kind === 'total',
      alignment: column.type === 'text' ? 'left' : 'center',
      fontSize: FONT_SIZE.cell,
    }));
  }

  /** The legend, when the grid uses markers. */
  private buildLegend(model: ReportDataModel): Content[] {
    if (model.legend.length === 0) {
      return [];
    }

    return [
      {
        text: 'Legendă',
        bold: true,
        fontSize: FONT_SIZE.legend,
        margin: [0, 10, 0, 3],
      },
      {
        columns: model.legend.map((item) => ({
          text: `${item.marker} = ${item.label}`,
          fontSize: FONT_SIZE.legend,
        })),
      },
    ];
  }
}

/**
 * One cell's printed text.
 *
 * The mirror image of the Excel renderer's `toExcelValue`: there, a number cell
 * writes its machine `value` so the column can be summed; here it writes the
 * `text` the builder already formatted — `140h`, or the dash that stands for a
 * project somebody never touched. Both read the same cell, and neither invents a
 * figure.
 */
function toPdfText(cell: ReportCell | undefined): string {
  if (cell === undefined) {
    return '';
  }

  switch (cell.kind) {
    case 'number':
      return cell.text;
    case 'marker':
      return cell.text;
    case 'text':
      return cell.text ?? '';
  }
}

/** A KPI value, without the trailing zeros nobody wants to read. */
function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}
