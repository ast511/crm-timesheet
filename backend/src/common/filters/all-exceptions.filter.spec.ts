import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';

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
});
