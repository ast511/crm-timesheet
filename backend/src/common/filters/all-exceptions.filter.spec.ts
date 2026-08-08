import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { ERROR_CODES } from '../constants/error-codes.constants';
import { codedError } from '../errors/coded-error';
import { ApiErrorResponse } from '../interfaces/api-response.interface';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });

  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', url: '/api/v1/employees/42' }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;

  /** Runs the filter and returns the rendered body. */
  const render = (exception: unknown): ApiErrorResponse => {
    filter.catch(exception, host);

    return json.mock.calls.at(-1)?.[0] as ApiErrorResponse;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders an HttpException with its own status and message', () => {
    const body = render(new NotFoundException('Employee not found'));

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(body).toEqual({
      success: false,
      statusCode: HttpStatus.NOT_FOUND,
      message: 'Employee not found',
      path: '/api/v1/employees/42',
      timestamp: expect.any(String) as unknown as string,
    });
  });

  it('keeps the per-field messages of a validation failure', () => {
    const body = render(
      new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: ['email must be an email', 'page must not be less than 1'],
        error: 'Bad Request',
      }),
    );

    expect(body.message).toEqual([
      'email must be an email',
      'page must not be less than 1',
    ]);
  });

  it('falls back to the exception message when the payload carries none', () => {
    const body = render(
      new HttpException({ reason: 'teapot' }, HttpStatus.I_AM_A_TEAPOT),
    );

    expect(body.statusCode).toBe(HttpStatus.I_AM_A_TEAPOT);
    expect(typeof body.message).toBe('string');
  });

  it('turns an unexpected error into a 500 without leaking its message', () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const body = render(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(error).toHaveBeenCalled();

    error.mockRestore();
  });

  it('handles a thrown non-Error value', () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const body = render('something went wrong');

    expect(body.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.message).toBe('Internal server error');

    error.mockRestore();
  });

  it('does not log client errors', () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    render(new NotFoundException());

    expect(error).not.toHaveBeenCalled();

    error.mockRestore();
  });

  it('timestamps the response as an ISO-8601 string', () => {
    const { timestamp } = render(new NotFoundException());

    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  });

  /**
   * The error code (Feature 033), decided here and nowhere else.
   *
   * Four rules in precedence order, and the fourth — "no code at all" — is the
   * one the whole gradual migration rests on: thirty modules throw uncoded
   * exceptions and must keep producing exactly the envelope they always did.
   */
  describe('the error code', () => {
    it('takes the one the exception carries', () => {
      const body = render(
        new UnauthorizedException(
          codedError(
            ERROR_CODES.AUTH_INVALID_CREDENTIALS,
            'Invalid email or password',
          ),
        ),
      );

      expect(body.errorCode).toBe('AUTH_INVALID_CREDENTIALS');
      expect(body.message).toBe('Invalid email or password');
      expect(body.statusCode).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('carries the params a translation interpolates', () => {
      const body = render(
        new ConflictException(
          codedError(ERROR_CODES.INTERNAL_ERROR, 'Month is locked', {
            month: 9,
            year: 2026,
            locked: true,
          }),
        ),
      );

      expect(body.params).toEqual({ month: 9, year: 2026, locked: true });
    });

    it('omits params when the exception carries none', () => {
      const body = render(
        new UnauthorizedException(
          codedError(ERROR_CODES.AUTH_UNAUTHENTICATED, 'No token'),
        ),
      );

      expect(body).not.toHaveProperty('params');
    });

    /**
     * Not `errorCode: undefined` — the key is absent. A client branches on
     * whether it is there, and `undefined` would survive a `toEqual` while
     * looking like a value to anything reading the object before serialisation.
     */
    it('leaves the key off entirely for an exception with no code', () => {
      const body = render(new NotFoundException('Employee not found'));

      expect(body).not.toHaveProperty('errorCode');
      expect(Object.keys(body)).not.toContain('errorCode');
    });

    it('reports an unexpected failure as INTERNAL_ERROR without leaking why', () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      const body = render(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

      expect(body.errorCode).toBe('INTERNAL_ERROR');
      expect(body.message).toBe('Internal server error');
      expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');

      error.mockRestore();
    });

    it('reports a deliberate 500 as INTERNAL_ERROR too', () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      expect(render(new InternalServerErrorException()).errorCode).toBe(
        'INTERNAL_ERROR',
      );

      error.mockRestore();
    });

    it('reports a validation failure as VALIDATION_ERROR, keeping every field message', () => {
      const body = render(
        new BadRequestException({
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['email must be an email', 'page must not be less than 1'],
          error: 'Bad Request',
        }),
      );

      expect(body.errorCode).toBe('VALIDATION_ERROR');
      expect(body.message).toEqual([
        'email must be an email',
        'page must not be less than 1',
      ]);
    });

    /**
     * A number of domain checks in this project throw
     * `BadRequestException([...])` deliberately, so that "a client handles it
     * with the code it already has for field errors". Reporting those as
     * `VALIDATION_ERROR` is the conclusion those sites already drew, now stated
     * in the envelope.
     */
    it('reports a domain error shaped like a field-error array the same way', () => {
      expect(
        render(
          new BadRequestException(['endDate must not be before startDate']),
        ).errorCode,
      ).toBe('VALIDATION_ERROR');
    });

    it('leaves a single-message 400 uncoded', () => {
      expect(
        render(new BadRequestException('That will not do')),
      ).not.toHaveProperty('errorCode');
    });

    /** An explicit code outranks both the 500 rule and the validation rule. */
    it('lets an explicit code win over the rules it would otherwise fall under', () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      expect(
        render(
          new BadRequestException(
            codedError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, ['a', 'b']),
          ),
        ).errorCode,
      ).toBe('AUTH_INVALID_CREDENTIALS');

      expect(
        render(
          new InternalServerErrorException(
            codedError(ERROR_CODES.AUTH_INACTIVE_USER, 'Deactivated'),
          ),
        ).errorCode,
      ).toBe('AUTH_INACTIVE_USER');

      error.mockRestore();
    });

    /**
     * `params` is copied straight into a response body, so anything that is not
     * a flat record of scalars is dropped rather than serialised into a shape
     * the frontend's interpolation cannot use.
     */
    it.each([
      ['an array', ['a', 'b']],
      ['a nested object', { inner: { deep: 1 } }],
      ['a null', null],
      ['a value that is not an object', 'params'],
    ])('drops %s rather than passing it through as params', (_case, params) => {
      const body = render(
        new UnauthorizedException({
          errorCode: ERROR_CODES.AUTH_UNAUTHENTICATED,
          message: 'No token',
          params,
        }),
      );

      expect(body.errorCode).toBe('AUTH_UNAUTHENTICATED');
      expect(body).not.toHaveProperty('params');
    });

    it('ignores a blank code rather than emitting an empty one', () => {
      expect(
        render(
          new UnauthorizedException({ errorCode: '', message: 'No token' }),
        ),
      ).not.toHaveProperty('errorCode');
    });
  });
});
