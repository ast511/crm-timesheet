import { Weekday } from '../../generated/prisma/enums';
import {
  daysSinceWeekStart,
  toDateKey,
  toIsoTimestamp,
  toNullableIsoTimestamp,
  toZonedDate,
  toZonedDateKey,
  toZonedTimestamp,
  weekdayOf,
} from './date.util';

describe('toIsoTimestamp', () => {
  it('renders a date as an ISO-8601 UTC string', () => {
    expect(toIsoTimestamp(new Date(Date.UTC(2026, 0, 31, 9, 5, 0)))).toBe(
      '2026-01-31T09:05:00.000Z',
    );
  });

  it('defaults to the current time', () => {
    const before = Date.now();

    const timestamp = Date.parse(toIsoTimestamp());

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(Date.now());
  });
});

describe('toNullableIsoTimestamp', () => {
  it('renders a date the same way toIsoTimestamp does', () => {
    const date = new Date(Date.UTC(2026, 0, 31, 9, 5, 0));

    expect(toNullableIsoTimestamp(date)).toBe(toIsoTimestamp(date));
  });

  it('keeps null as null rather than defaulting to now', () => {
    expect(toNullableIsoTimestamp(null)).toBeNull();
  });
});

describe('weekdayOf', () => {
  it('names the weekday the way WorkSchedule.workingDays names one', () => {
    // 7 September 2026 is a Monday.
    expect(weekdayOf(new Date('2026-09-07T00:00:00.000Z'))).toBe(
      Weekday.MONDAY,
    );
    expect(weekdayOf(new Date('2026-09-13T00:00:00.000Z'))).toBe(
      Weekday.SUNDAY,
    );
  });

  /**
   * The columns hold UTC midnight for a calendar day, so reading a *local*
   * weekday would make the answer depend on where the server is deployed — a
   * Monday west of Greenwich is the previous Sunday, which turns an ordinary
   * working day into a weekend and refuses an entry somebody made correctly.
   */
  it('reads the day in UTC, not in the server’s timezone', () => {
    // Midnight UTC on a Monday is still Sunday evening in the Americas.
    expect(weekdayOf(new Date('2026-09-07T00:00:00.000Z'))).toBe(
      Weekday.MONDAY,
    );
    // And the last instant of that Monday is still Monday.
    expect(weekdayOf(new Date('2026-09-07T23:59:59.999Z'))).toBe(
      Weekday.MONDAY,
    );
  });
});

describe('daysSinceWeekStart', () => {
  const monday = new Date('2026-09-07T00:00:00.000Z');
  const sunday = new Date('2026-09-13T00:00:00.000Z');

  it('is 0 on the first day of the week and 6 on the last', () => {
    expect(daysSinceWeekStart(monday, Weekday.MONDAY)).toBe(0);
    expect(daysSinceWeekStart(sunday, Weekday.MONDAY)).toBe(6);
  });

  /**
   * The reason the function takes the week's first day rather than assuming one:
   * the working week begins on Sunday across much of the world, and grouping a
   * such a company's days Monday-first would split their week across two buckets
   * — leaving a weekly hour ceiling that never binds.
   */
  it('re-anchors the week when it begins on a Sunday', () => {
    expect(daysSinceWeekStart(sunday, Weekday.SUNDAY)).toBe(0);
    expect(daysSinceWeekStart(monday, Weekday.SUNDAY)).toBe(1);
  });

  it('re-anchors the week when it begins on a Saturday', () => {
    const saturday = new Date('2026-09-12T00:00:00.000Z');

    expect(daysSinceWeekStart(saturday, Weekday.SATURDAY)).toBe(0);
    expect(daysSinceWeekStart(sunday, Weekday.SATURDAY)).toBe(1);
    expect(daysSinceWeekStart(monday, Weekday.SATURDAY)).toBe(2);
  });

  it('stays inside one week for every weekday and every start', () => {
    for (const start of Object.values(Weekday)) {
      for (let offset = 0; offset < 7; offset += 1) {
        const date = new Date(monday.getTime() + offset * 86_400_000);

        expect(daysSinceWeekStart(date, start)).toBeGreaterThanOrEqual(0);
        expect(daysSinceWeekStart(date, start)).toBeLessThan(7);
      }
    }
  });
});

describe('toDateKey', () => {
  it('renders the UTC calendar date, without the time nobody entered', () => {
    expect(toDateKey(new Date('2026-09-07T13:45:12.000Z'))).toBe('2026-09-07');
  });
});

/**
 * The three zoned helpers, and the distinction between them is the whole reason
 * they are three.
 *
 * `toZonedDateKey` produces a **key** — ISO, whatever the language — because it
 * identifies a column of a grid and an entry in a `Map`. The other two produce
 * what a person **reads**, so they follow the locale's conventions.
 */
describe('the zoned helpers', () => {
  /** 22:30 UTC on the 7th is already the 8th in Bucharest (UTC+3 in September). */
  const LATE_EVENING = new Date('2026-09-07T22:30:00.000Z');

  describe('toZonedDateKey', () => {
    it('answers which calendar day an instant falls on, in the zone', () => {
      expect(toZonedDateKey(LATE_EVENING, 'Europe/Bucharest')).toBe(
        '2026-09-08',
      );
      expect(toZonedDateKey(LATE_EVENING, 'America/New_York')).toBe(
        '2026-09-07',
      );
    });

    /** ISO whatever the zone, because it is a key rather than a rendering. */
    it('stays ISO-8601', () => {
      expect(toZonedDateKey(LATE_EVENING, 'UTC')).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
    });
  });

  describe('toZonedDate', () => {
    it('writes the same day the way the locale does', () => {
      expect(toZonedDate(LATE_EVENING, 'Europe/Bucharest', 'ro-RO')).toBe(
        '08.09.2026',
      );
      expect(toZonedDate(LATE_EVENING, 'America/New_York', 'ro-RO')).toBe(
        '07.09.2026',
      );
    });
  });

  describe('toZonedTimestamp', () => {
    /**
     * The bug it was written for: printing the ISO string beside a zone name
     * states the UTC time under a label three hours ahead of it, so a reader
     * checking it against their own clock finds the document wrong by exactly
     * the offset.
     */
    it('renders the wall-clock time in the zone, not the UTC one', () => {
      const generated = new Date('2026-08-07T18:28:03.176Z');

      expect(toZonedTimestamp(generated, 'Europe/Bucharest', 'ro-RO')).toBe(
        '07.08.2026, 21:28',
      );
      expect(toZonedTimestamp(generated, 'UTC', 'ro-RO')).toBe(
        '07.08.2026, 18:28',
      );
    });

    it('is 24-hour, so 13:00 is not rendered as 1:00', () => {
      expect(
        toZonedTimestamp(new Date('2026-08-07T10:00:00.000Z'), 'UTC', 'ro-RO'),
      ).toBe('07.08.2026, 10:00');
      expect(
        toZonedTimestamp(new Date('2026-08-07T22:00:00.000Z'), 'UTC', 'ro-RO'),
      ).toBe('07.08.2026, 22:00');
    });
  });
});
