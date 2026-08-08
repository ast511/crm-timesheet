import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

import { ApiSuccessResponse } from '../interfaces/api-response.interface';

/**
 * Wraps every successful response in the API's success envelope.
 *
 * Handlers keep returning their own DTO — an object, an array, or nothing at
 * all — and the envelope is added here, so no controller repeats it and no
 * endpoint can forget it. Registered globally in `configureApp`.
 *
 * Errors are untouched: a thrown exception travels the error channel of the
 * stream, never reaches `map`, and is rendered by `AllExceptionsFilter`
 * instead.
 *
 * **`StreamableFile` is the one exception, added by Feature 031**, and it is a
 * genuine exception rather than a loophole. The envelope exists so a client reads
 * the same two fields whatever it called — but a report export's body is a
 * spreadsheet or a PDF, and there is no reading of `{ success, data }` that can
 * contain a binary file. Wrapping one would serialise the stream object into
 * `{"success":true,"data":{}}` and send that with a `Content-Type` promising an
 * xlsx, which is a corrupt download rather than a differently-shaped response.
 *
 * It is `StreamableFile` and not "any endpoint that opts out", deliberately: the
 * carve-out is tied to a Nest type that only a file response can produce, so no
 * ordinary handler can accidentally escape the envelope by returning the wrong
 * shape.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T | null> | StreamableFile
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T | null> | StreamableFile> {
    return next.handle().pipe(
      map((data): ApiSuccessResponse<T | null> | StreamableFile => {
        if (data instanceof StreamableFile) {
          return data;
        }

        return {
          success: true,
          // A handler that returns nothing (a `void` delete, for instance) still
          // produces a valid envelope: `data` is explicitly `null` rather than an
          // absent key, so clients read one field regardless of the endpoint.
          // Only `undefined` and `null` are replaced — `0`, `''` and `false` are
          // legitimate payloads and pass through unchanged.
          data: data ?? null,
        };
      }),
    );
  }
}
