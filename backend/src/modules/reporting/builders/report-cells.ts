import {
  EMPTY_CELL,
  NO_VALUE_TEXT,
  ReportCell,
  ReportLegendItem,
  ReportMarkerCell,
  ReportNumberCell,
  ReportTextCell,
} from '../entities/report-data-model.entity';
import { ClassifiedMonth } from '../reporting.types';

/**
 * How every cell in every report is built.
 *
 * Five builders each writing their own `${hours}h` would eventually produce a
 * grid printing `8h` beside one printing `8.0h`, and the two hour matrices —
 * which are the same data twice — would be the pair it showed up in. So the
 * formatting lives here and a builder chooses *which* kind of cell a value is,
 * never how it is drawn.
 *
 * The functions are trivial on purpose. Their value is not the logic, it is that
 * there is exactly one of each.
 */

/** A plain text cell. `null` prints as blank rather than as the string "null". */
export function textCell(text: string | null): ReportTextCell {
  return { kind: 'text', text };
}

/**
 * A cell holding hours.
 *
 * **`null` and `0` are different and both occur.** A project an employee never
 * touched has `null` and prints a dash; a total that genuinely came to nothing
 * has `0` and prints `0h`. Collapsing them would turn the mostly-empty hour
 * matrices into a wall of zeros, each falsely claiming somebody booked no time
 * to a project they were never assigned to.
 *
 * The machine value is kept beside the text so the Excel renderer can write a
 * real number — a spreadsheet whose hour cells are strings cannot be summed or
 * sorted, and looks identical until somebody tries.
 */
export function hoursCell(value: number | null): ReportNumberCell {
  return {
    kind: 'number',
    value,
    text: value === null ? NO_VALUE_TEXT : `${formatHours(value)}h`,
  };
}

/** A cell holding a plain count — days, people — with no unit suffix. */
export function countCell(value: number | null): ReportNumberCell {
  return {
    kind: 'number',
    value,
    text: value === null ? NO_VALUE_TEXT : String(value),
  };
}

/** A cell holding a day marker. */
export function markerCell(
  marker: string,
  legendKey: string,
  text?: string,
): ReportMarkerCell {
  return { kind: 'marker', marker, legendKey, text: text ?? marker };
}

export { EMPTY_CELL };

/**
 * Hours, without the trailing zeros nobody wants to read.
 *
 * `8` rather than `8.00`, and `7.5` rather than `7.50`. The column stores two
 * decimals because the arithmetic needs them; a grid printing them on every one
 * of a thousand cells is a grid that is harder to scan for no gain.
 */
export function formatHours(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * The legend for a day grid, built from the days that **actually occur**.
 *
 * This is the function the dynamic-marker rule lives in. It walks the classified
 * months and collects one entry per distinct `legendKey` it finds — so a month in
 * which nobody took medical leave has no medical line, and a company that adds a
 * kind of leave next year sees it appear here the first time somebody takes it,
 * with no code change anywhere.
 *
 * The alternative — listing every configured leave type — was rejected twice
 * over: it prints eight lines under a grid that used two, and it would have meant
 * this module reading `leave_types` in full to explain a document that already
 * knows which markers it drew.
 *
 * Ordered by marker so two reports of the same month produce the same legend in
 * the same order, which is what makes the export/preview comparison exact rather
 * than set-wise.
 */
export function buildLegend(
  months: readonly ClassifiedMonth[],
): ReportLegendItem[] {
  const items = new Map<string, ReportLegendItem>();

  for (const month of months) {
    for (const day of month.days) {
      if (day.legendKey === null || day.legendLabel === null) {
        continue;
      }

      if (!items.has(day.legendKey)) {
        items.set(day.legendKey, {
          key: day.legendKey,
          marker: day.marker,
          label: day.legendLabel,
        });
      }
    }
  }

  return [...items.values()].sort((left, right) =>
    left.marker.localeCompare(right.marker),
  );
}

/**
 * The short badge a client group band prints — `TEC` for `TechCorp Solutions`.
 *
 * Derived from the name because **there is no client entity to carry a code**.
 * It is presentation only: nothing keys off it, two clients may perfectly well
 * produce the same badge, and the full name is printed beside it in every case.
 */
export function clientBadge(clientName: string): string {
  return clientName.slice(0, 3).toUpperCase();
}

/** Builds a row's cells from a list of `(columnKey, cell)` pairs. */
export function toCells(
  entries: readonly (readonly [string, ReportCell])[],
): Record<string, ReportCell> {
  return Object.fromEntries(entries);
}
