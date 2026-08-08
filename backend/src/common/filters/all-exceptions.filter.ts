import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { ERROR_CODES, ErrorParams } from '../constants/error-codes.constants';
import { readCodedError } from '../errors/coded-error';
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

    const message = isHttpException
      ? extractMessage(exception)
      : UNEXPECTED_ERROR_MESSAGE;

    const body: ApiErrorResponse = {
      success: false,
      statusCode,
      message,
      // Spread, so the two keys are *absent* rather than present-and-undefined
      // when there is no code. `JSON.stringify` drops an undefined value anyway,
      // but the object this filter builds is also what the spec asserts against
      // with `toEqual`, and "the key is not there" is the contract Feature 033
      // gave clients to branch on.
      ...describeError(exception, isHttpException, statusCode, message),
      path: request.url,
      timestamp: toIsoTimestamp(),
    };

    response.status(statusCode).json(body);
  }
}

/**
 * The stable code for a failure, and the values a translation interpolates.
 *
 * **The one place an `errorCode` is decided**, which is what keeps the rule
 * readable as a single ladder rather than as a condition spread over three
 * files. In precedence order:
 *
 * 1. **The exception said so.** A throw site that supplied a code through
 *    `codedError` wins over everything below — including the `500` rule, since a
 *    deliberately coded server error knows more about itself than this function
 *    does.
 * 2. **Anything at 500 or above is {@link ERROR_CODES.INTERNAL_ERROR}.** The
 *    message on those is the fixed sentence rather than the real reason, so
 *    without a code a client would have nothing stable to key on for precisely
 *    the failures it can say least about.
 * 3. **A `400` whose message is an array is
 *    {@link ERROR_CODES.VALIDATION_ERROR}.** That shape is the `ValidationPipe`'s
 *    signature, and it is *also* deliberately produced by a number of domain
 *    checks in this project — `assertProcessorExists`, the leave-request span
 *    rules — which chose it so that "a client handles it with the code it
 *    already has for field errors". Reporting those as `VALIDATION_ERROR` is
 *    therefore not over-reach; it is the conclusion those sites already drew,
 *    now stated in the envelope. Any of them that wants a code of its own simply
 *    supplies one, and rule 1 takes it.
 * 4. **Otherwise, no code at all.** Every un-migrated module's `NotFoundException`
 *    and `ConflictException` falls here and produces the envelope it always did.
 *    Inventing a code from the status — `NOT_FOUND` for every 404 — was
 *    considered and rejected: it would tell a frontend nothing `statusCode` does
 *    not already say, while looking like a real code that could be translated
 *    into something specific.
 */
function describeError(
  exception: unknown,
  isHttpException: boolean,
  statusCode: number,
  message: string | string[],
): { errorCode?: string; params?: ErrorParams } {
  if (isHttpException) {
    const coded = readCodedError(exception as HttpException);

    if (coded.errorCode !== undefined) {
      return coded;
    }
  }

  if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
    return { errorCode: ERROR_CODES.INTERNAL_ERROR };
  }

  if (statusCode === HttpStatus.BAD_REQUEST && Array.isArray(message)) {
    return { errorCode: ERROR_CODES.VALIDATION_ERROR };
  }

  return {};
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
