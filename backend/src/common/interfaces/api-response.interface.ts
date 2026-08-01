/**
 * The two envelopes every HTTP response of this API uses.
 *
 * `success` is the discriminant: a client checks one field to know whether it
 * received data or an error, without inspecting the status code first. The
 * shapes are produced in exactly two places — `ResponseInterceptor` for the
 * success envelope, `AllExceptionsFilter` for the error one — so no controller
 * ever builds them by hand.
 */

/** Envelope wrapped around every successful response body. */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/** Envelope returned for every handled and unhandled failure. */
export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  /**
   * A single explanation, or one entry per rejected field. The array form is
   * what the global `ValidationPipe` produces, and it is preserved rather than
   * joined so a form can map each message back to its input.
   */
  message: string | string[];
  /** Request path that produced the error, useful when correlating logs. */
  path: string;
  /** ISO-8601 UTC timestamp of the moment the error was rendered. */
  timestamp: string;
}
