import { plainToInstance } from 'class-transformer';

import { ToBoolean } from './to-boolean.decorator';

class Filter {
  @ToBoolean()
  isActive?: unknown;
}

const transform = (isActive: unknown): unknown =>
  plainToInstance(Filter, { isActive }).isActive;

describe('ToBoolean', () => {
  it('converts the string "true"', () => {
    expect(transform('true')).toBe(true);
  });

  it('converts the string "false"', () => {
    expect(transform('false')).toBe(false);
  });

  it('leaves a real boolean alone', () => {
    expect(transform(true)).toBe(true);
    expect(transform(false)).toBe(false);
  });

  it('leaves an absent value absent', () => {
    expect(transform(undefined)).toBeUndefined();
  });

  it.each(['yes', '1', 'TRUE', 'False', ''])(
    'passes %p through for @IsBoolean() to reject',
    (value) => {
      expect(transform(value)).toBe(value);
    },
  );
});
