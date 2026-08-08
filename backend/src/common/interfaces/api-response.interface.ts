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
   *
   * **English, and for developers.** It is what a log entry and a stack trace
   * carry, and it is free to be reworded at any time. Since Feature 033 it is
   * deliberately *not* the thing a user interface translates against —
   * {@link ApiErrorResponse.errorCode} is.
   */
  message: string | string[];
  /**
   * A stable, machine-readable identifier for what went wrong —
   * `AUTH_INVALID_CREDENTIALS`, `VALIDATION_ERROR`. See `ERROR_CODES`.
   *
   * **Optional, and that is the point.** Feature 033 added it without touching
   * the thirty modules that came before: an exception carrying no code produces
   * exactly the envelope it produced before, with this key absent entirely
   * rather than present and `undefined`. A client therefore has to handle its
   * absence — by falling back to `statusCode` and `message` — and that fallback
   * is what makes the migration gradual rather than a flag day.
   *
   * Where it *is* present it is a contract: renaming one is a breaking change,
   * because a frontend has a translation keyed on it.
   */
  errorCode?: string;
  /**
   * Structured values for a translation to interpolate — `{ month: 9, year: 2026 }`
   * behind `"Luna {{month}}/{{year}} este deja blocată"`.
   *
   * Flat scalars only, and only ever present alongside an `errorCode`, since
   * values with nothing to interpolate them into would be a second response body
   * travelling inside an error. Which params a code carries is documented on the
   * code itself.
   */
  params?: Record<string, string | number | boolean>;
  /** Request path that produced the error, useful when correlating logs. */
  path: string;
  /** ISO-8601 UTC timestamp of the moment the error was rendered. */
  timestamp: string;
}
