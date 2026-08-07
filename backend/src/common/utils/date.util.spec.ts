import { Weekday } from '../../generated/prisma/enums';
import {
  daysSinceWeekStart,
  toDateKey,
  toIsoTimestamp,
  toNullableIsoTimestamp,
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
