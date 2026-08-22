import { toApiError } from '@/api/api-error';

/**
 * The two refusals this module answers with that the `errors` bundle cannot
 * translate, and why each is read from its status here rather than from an
 * `errorCode`.
 *
 * `useApiErrorMessage` translates the envelope's `errorCode`. **This module
 * emits none** — `WorkScheduleService` throws bare `NotFoundException` and
 * `ConflictException`, and `all-exceptions.filter.ts` only ever *assigns* a code
 * for a `500` or a `BadRequestException` — so both arrive with `errorCode:
 * null` and fall through to a generic sentence about the status.
 *
 * For one of them a generic sentence is fine. For the other two it is not, and
 * that is what this file is for. No code is invented: what is inferred is only
 * what the *contract* documents about where each status can come from.
 */

const NOT_FOUND_STATUS = 404;
const CONFLICT_STATUS = 409;

/**
 * True when the API answered "no configuration has been stored yet".
 *
 * **This is not an error, and the backend says so in the operation's own
 * description:** *"A `404` means no configuration has been stored yet, which is
 * a legitimate state on a fresh deployment."* `GET /work-schedule` has exactly
 * one `404`, raised in one place, so the status is unambiguous here in a way it
 * would not be on a route that takes an id.
 *
 * It is separated out because the two answers need opposite screens. A real
 * failure gets `QueryErrorState` — a message and a retry button. This gets the
 * empty form, pre-filled with the documented defaults, because the thing to do
 * about it is to fill it in and press Save, which is precisely what the
 * backend's own message says: *"Send PUT /api/v1/work-schedule to create it."*
 * A retry button would be a control that could never help.
 */
export const isWorkScheduleMissing = (error: unknown): boolean =>
  toApiError(error).status === NOT_FOUND_STATUS;

/**
 * True when adding an address was refused because it is already configured.
 *
 * `POST /work-schedule/emails` declares exactly one `409`, and the service
 * raises it in exactly one place — `assertEmailIsFree`, on a case-insensitive
 * match against `email`. So a `409` on this endpoint cannot mean anything but
 * "this address is already on the list".
 *
 * The message goes **on the field**, as F10 established for the same shape of
 * form: the resource has one editable value, so there is nothing to
 * disambiguate and the sentence belongs where the value to change is, rather
 * than in a form-level alert pointing at the only input on screen.
 *
 * Like F10's equivalent, this is a deletion-in-waiting: when the backend gives
 * this `409` an `errorCode`, the code joins `errors.json` beside every other one
 * and this predicate goes away.
 */
export const isDuplicateApprovalEmailConflict = (error: unknown): boolean =>
  toApiError(error).status === CONFLICT_STATUS;
