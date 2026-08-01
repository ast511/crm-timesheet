import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
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
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T | null>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T | null>> {
    return next.handle().pipe(
      map((data): ApiSuccessResponse<T | null> => ({
        success: true,
        // A handler that returns nothing (a `void` delete, for instance) still
        // produces a valid envelope: `data` is explicitly `null` rather than an
        // absent key, so clients read one field regardless of the endpoint.
        // Only `undefined` and `null` are replaced — `0`, `''` and `false` are
        // legitimate payloads and pass through unchanged.
        data: data ?? null,
      })),
    );
  }
}
