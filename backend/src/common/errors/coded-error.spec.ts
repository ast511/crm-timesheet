import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { ERROR_CODES } from '../constants/error-codes.constants';
import { codedError, readCodedError } from './coded-error';

describe('codedError', () => {
  it('puts the code beside the message rather than instead of it', () => {
    expect(
      codedError(
        ERROR_CODES.AUTH_INVALID_CREDENTIALS,
        'Invalid email or password',
      ),
    ).toEqual({
      errorCode: 'AUTH_INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    });
  });

  it('keeps an array message intact, so field errors survive', () => {
    expect(
      codedError(ERROR_CODES.VALIDATION_ERROR, ['a must be a', 'b must be b'])
        .message,
    ).toEqual(['a must be a', 'b must be b']);
  });

  /**
   * Omitted rather than set to `undefined`: the payload is serialised into a
   * response, and a key whose value is `undefined` either vanishes silently or —
   * through a different serialiser — appears as `null`, which is a third thing
   * for a client to handle.
   */
  it('leaves params off the payload entirely when there are none', () => {
    expect(
      Object.keys(codedError(ERROR_CODES.AUTH_UNAUTHENTICATED, 'No token')),
    ).toEqual(['errorCode', 'message']);
  });

  it('carries params when they are given', () => {
    expect(
      codedError(ERROR_CODES.INTERNAL_ERROR, 'Locked', { month: 9, year: 2026 })
        .params,
    ).toEqual({ month: 9, year: 2026 });
  });
});

/**
 * The reader is what makes the mechanism work with **ordinary Nest exceptions**
 * rather than a class of its own — which is why every case here throws a real
 * `UnauthorizedException` or `ConflictException` instead of some test double.
 */
describe('readCodedError', () => {
  it('reads the code back off an ordinary Nest exception', () => {
    const exception = new UnauthorizedException(
      codedError(ERROR_CODES.AUTH_INACTIVE_USER, 'Deactivated'),
    );

    expect(readCodedError(exception)).toEqual({
      errorCode: 'AUTH_INACTIVE_USER',
    });
  });

  it('reads the params too', () => {
    const exception = new ConflictException(
      codedError(ERROR_CODES.INTERNAL_ERROR, 'Locked', { month: 9 }),
    );

    expect(readCodedError(exception).params).toEqual({ month: 9 });
  });

  /**
   * The property the whole gradual migration rests on: thirty modules throw
   * exactly this and must keep producing exactly the envelope they always did.
   */
  it('finds nothing on an exception thrown with a plain string', () => {
    expect(readCodedError(new NotFoundException('Employee not found'))).toEqual(
      {},
    );
  });

  it('finds nothing on Nest’s own default payload', () => {
    expect(readCodedError(new NotFoundException())).toEqual({});
  });

  it('ignores a code that is not a non-empty string', () => {
    expect(
      readCodedError(
        new UnauthorizedException({ errorCode: '', message: 'x' }),
      ),
    ).toEqual({});
    expect(
      readCodedError(new UnauthorizedException({ errorCode: 7, message: 'x' })),
    ).toEqual({});
  });

  /**
   * Dropped rather than thrown on: this runs while an error is already being
   * rendered, and a reader that threw would turn a `404` into an unhandled
   * `500`.
   */
  it.each([
    ['an array', ['a']],
    ['a nested object', { inner: { deep: 1 } }],
    ['null', null],
    ['a string', 'params'],
  ])('drops params that are %s, keeping the code', (_case, params) => {
    expect(
      readCodedError(
        new UnauthorizedException({
          errorCode: ERROR_CODES.AUTH_UNAUTHENTICATED,
          message: 'No token',
          params,
        }),
      ),
    ).toEqual({ errorCode: 'AUTH_UNAUTHENTICATED' });
  });

  /**
   * `HttpException` derives `error.message` from a string `message` in the
   * payload, which is what keeps `rejects.toThrow(/some words/)` working across
   * the suite after a throw site gains a code. Worth pinning: if it stopped
   * being true, dozens of existing assertions would fail for a reason that had
   * nothing to do with what they test.
   */
  it('leaves the exception’s own message alone', () => {
    expect(
      new UnauthorizedException(
        codedError(ERROR_CODES.AUTH_INACTIVE_USER, 'Deactivated'),
      ).message,
    ).toBe('Deactivated');
  });

  /** The status is the exception class's, never the payload's. */
  it('does not touch the status the exception class chose', () => {
    expect(
      new ConflictException(
        codedError(ERROR_CODES.INTERNAL_ERROR, 'Clash'),
      ).getStatus(),
    ).toBe(409);
  });
});

/**
 * Codes are referenced by symbol, never typed as literals at a throw site.
 * `codedError` takes {@link ErrorCode}, so this is a compile-time property; the
 * assertions below pin the catalog's shape, which is what that type derives
 * from.
 */
describe('the catalog', () => {
  it('names every code exactly as its key', () => {
    for (const [key, value] of Object.entries(ERROR_CODES)) {
      expect(value).toBe(key);
    }
  });

  it('uses SCREAMING_SNAKE_CASE throughout', () => {
    for (const code of Object.values(ERROR_CODES)) {
      expect(code).toMatch(/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/);
    }
  });

  it('has no duplicate codes', () => {
    const codes = Object.values(ERROR_CODES);

    expect(new Set(codes).size).toBe(codes.length);
  });
});
