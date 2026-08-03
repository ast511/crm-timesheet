import { toIsoTimestamp, toNullableIsoTimestamp } from './date.util';

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
