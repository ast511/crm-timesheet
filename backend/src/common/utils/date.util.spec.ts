import { toIsoTimestamp } from './date.util';

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
