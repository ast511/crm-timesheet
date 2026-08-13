/**
 * How many notifications a bulk operation touched.
 *
 * Returned by "mark all read" and by both "delete all" endpoints, because
 * `{ "data": null }` would leave a client unable to tell "nothing was unread"
 * from "the request did nothing" — and on a destructive operation that is
 * exactly the thing a person wants confirmed.
 *
 * It lived in `notification.service.ts` until Feature 038 and moved here for
 * the reason it should always have been here: it is a response shape, every
 * other response shape in this project is in `entities/`, and only a class in
 * such a file is picked up by the schema generator. Nothing about it changed —
 * it is still one number, still produced by the service, still constructed as
 * an object literal.
 */
export class NotificationBulkResult {
  /**
   * The number of rows the operation changed or deleted.
   *
   * `0` is a legitimate and common answer: an inbox with nothing unread
   * answers `0` to "mark all read", and that is a successful request rather
   * than a failed one.
   */
  readonly affected!: number;
}
