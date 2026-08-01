import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { ApiErrorResponse } from '../interfaces/api-response.interface';
import { toIsoTimestamp } from '../utils/date.util';

/**
 * Returned instead of the real reason when something unexpected fails.
 *
 * An unhandled error's message is written by whatever threw it — a driver, a
 * library, Prisma — and can contain a query, a file path or a connection
 * string. The client gets a fixed sentence; the details go to the log.
 */
const UNEXPECTED_ERROR_MESSAGE = 'Internal server error';

/**
 * Renders every failure as the API's error envelope.
 *
 * `@Catch()` without arguments catches everything, so there is one code path
 * for `HttpException`s a handler threw deliberately and for errors nobody
 * expected. Registered globally in `configureApp`.
 *
 * The class holds no state beyond its logger and takes no constructor
 * dependency, which is what lets it be instantiated directly rather than
 * registered as a provider.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Only server-side failures are logged: a 404 or a rejected payload is
      // the client's mistake and logging it would bury the real incidents.
      this.logger.error(
        `${request.method} ${request.url} failed with ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorResponse = {
      success: false,
      statusCode,
      message: isHttpException
        ? extractMessage(exception)
        : UNEXPECTED_ERROR_MESSAGE,
      path: request.url,
      timestamp: toIsoTimestamp(),
    };

    response.status(statusCode).json(body);
  }
}

/**
 * Pulls the human-readable part out of an `HttpException`.
 *
 * Its payload has three shapes in practice: a plain string
 * (`new NotFoundException('Employee not found')`), Nest's default object
 * (`{ statusCode, message, error }`), and the `ValidationPipe`'s object whose
 * `message` is an array of per-field errors. Only the message is kept — the
 * status code is already a field of the envelope, and `error` would repeat it
 * in words.
 */
function extractMessage(exception: HttpException): string | string[] {
  const payload = exception.getResponse();

  if (typeof payload === 'string') {
    return payload;
  }

  const { message } = payload as { message?: unknown };

  if (typeof message === 'string') {
    return message;
  }

  if (Array.isArray(message)) {
    return message.map(String);
  }

  return exception.message;
}
