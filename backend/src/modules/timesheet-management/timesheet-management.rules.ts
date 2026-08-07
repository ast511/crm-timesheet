import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TimesheetStatus } from '../../generated/prisma/enums';
import {
  TIMESHEET_MAX_MONTH,
  TIMESHEET_MIN_MONTH,
} from './timesheet-management.constants';

/**
 * The assertions the lifecycle service and the fill-in engine share.
 *
 * Two services, one vocabulary of refusals. They are here rather than duplicated
 * because each is a statement about *what a timesheet is* rather than about
 * either service's job, and a second copy is the one that eventually lets an
 * approved month be edited — the same call `notification-management.rules.ts`
 * makes for the rule its two resources share.
 *
 * **Every function here is pure.** None reads the database, none takes a service,
 * and each decides from its arguments alone — which is what lets the rules be
 * tested without booting an application, and what keeps "who may do this" a
 * question with one answer rather than one per call site.
 *
 * On the status codes, which are consistent and deliberate:
 *
 * | Kind of refusal | Code | Why |
 * | --- | --- | --- |
 * | the caller is not the owner | `403` | about who is asking |
 * | the timesheet is in the wrong state | `409` | about the resource, not the caller |
 * | the submitted body contradicts itself or the calendar | `400` | nothing stored conflicts |
 *
 * The middle row is the one worth stating: refusing to edit an `APPROVED` month
 * is **not** a permission problem, and answering `403` would send somebody to
 * look for a role they are missing. Nobody may edit it, including the
 * administrator who approved it. The same distinction `LeaveRequestsService` and
 * `NotificationCampaignService` both draw.
 */

/**
 * Refuses a caller who is not the timesheet's owner.
 *
 * **A `403` and not a `404`**, which departs from the call `LeaveRequestsService`
 * makes for somebody else's leave request — and the difference is the route
 * rather than a change of mind. There, the id arrives on a `/me` collection where
 * distinguishing "not yours" from "does not exist" would let the endpoint confirm
 * that a colleague has leave pending. Here the owner is reached through
 * `/timesheets/me/:id`, and the caller has *already been shown* the id by the
 * endpoint that returned their own timesheet: the only way to meet this refusal
 * is to send somebody else's id deliberately, and telling them plainly that it is
 * not theirs is more useful than pretending their own collection is empty.
 *
 * Ownership is compared against `employeeId` rather than `userId`, because a
 * timesheet belongs to an *employment record* — the thing that has a hire date, a
 * position and a department — and not to a login.
 *
 * **This is domain logic, not authorization.** It is not a guard, it does not
 * consult the permission catalog, and it does not ask what the caller's role
 * allows: it states the rule that a timesheet is filled by the person it is
 * about, which would be true of this feature under any permission system. See
 * the module doc.
 */
export function assertOwner(user: CurrentUser, ownerEmployeeId: string): void {
  if (user.employeeId !== ownerEmployeeId) {
    throw new ForbiddenException(
      'A timesheet may only be filled in and submitted by the employee it belongs to',
    );
  }
}

/**
 * Refuses a caller who is not an administrator, on the endpoints that review.
 *
 * Read from `CurrentUser.administrativeAccess`, which is derived from the claimed
 * role rather than sent — so a caller cannot claim `USER` and administrative
 * access at once.
 *
 * **It authenticates nothing**, and cannot: any caller may claim any role until
 * authentication exists. It is here for the reason `NotificationService` refuses
 * the administrative workspace to an ordinary employee — that check is what the
 * *workspace* means, not an access control arriving early — and for the sharper
 * reason that approving your own month is the one thing this lifecycle must not
 * permit by accident. When authentication lands, this stays exactly as it is and
 * a guard is added in front of it.
 */
export function assertAdministrative(user: CurrentUser): void {
  if (!user.administrativeAccess) {
    throw new ForbiddenException(
      'Only an administrator may approve, reject or delete a timesheet',
    );
  }
}

/**
 * Refuses a write to a timesheet that is not in one of the states it allows.
 *
 * The `action` argument is only there so the message says what the caller was
 * trying to do; the rule is the same one however it is reached, which is why
 * there is one function rather than one per transition. Three copies would have
 * been three chances to allow one of them by accident, and the whole immutability
 * story rests on this.
 *
 * The message names both the status the timesheet holds and the ones that would
 * have been acceptable, because "cannot be edited" without either sends somebody
 * looking for a permission problem that does not exist.
 */
export function assertStatusIs(
  id: string,
  status: TimesheetStatus,
  allowed: readonly TimesheetStatus[],
  action: string,
): void {
  if (!allowed.includes(status)) {
    throw new ConflictException(
      `Timesheet ${id} is ${status} and cannot be ${action}; only ${allowed.join(' and ')} timesheets may be`,
    );
  }
}

/**
 * Refuses any change to a month that has been approved.
 *
 * A narrower, louder version of {@link assertStatusIs} for the one case worth
 * naming on its own: `APPROVED` is terminal, and the message says *why* rather
 * than only listing states. An approved timesheet is what the company agreed
 * somebody worked; changing it afterwards would leave the approval describing a
 * month that no longer exists, and its `scheduleSnapshot` describing rules the
 * entries no longer obey.
 */
export function assertNotApproved(id: string, status: TimesheetStatus): void {
  if (status === TimesheetStatus.APPROVED) {
    throw new ConflictException(
      `Timesheet ${id} has been approved and is now immutable: an approved month is the record of what the company agreed was worked, and cannot be edited, re-opened or deleted`,
    );
  }
}

/**
 * Refuses a timesheet the owner may still be filling in.
 *
 * The visibility half of the lifecycle, applied wherever an administrator
 * addresses a timesheet by id. A `404` rather than a `403`, deliberately and
 * unlike {@link assertOwner}: a draft is *private*, so distinguishing "not
 * finished" from "does not exist" would let an administrator discover that a
 * colleague has started their month — and, on a screen that lists what is
 * outstanding, quietly invite them to ask about it.
 */
export function assertAdminVisible(
  id: string,
  status: TimesheetStatus,
  visible: readonly TimesheetStatus[],
): void {
  if (!visible.includes(status)) {
    throw new NotFoundTimesheet(id);
  }
}

/**
 * The `404` every path that cannot find — or may not reveal — a timesheet
 * answers with.
 *
 * A class rather than a message helper, because two genuinely different
 * situations must produce an *identical* response: a timesheet that is not there,
 * and one that is there as somebody's private draft. Written as two `throw new
 * NotFoundException(...)` calls they would eventually drift into saying different
 * things, and the difference would be the leak.
 */
export class NotFoundTimesheet extends NotFoundException {
  constructor(id: string) {
    super(`Timesheet ${id} was not found`);
  }
}

/**
 * Refuses a month outside the range the API accepts, or one that has not
 * happened yet.
 *
 * Two rules, and the second is the one with an argument behind it. A timesheet is
 * an account of work that has been done; a month that has not begun has nothing
 * in it to account for, and accepting one would let somebody claim hours in
 * advance and let a reminder chase a month nobody could yet fill. The **current**
 * month is allowed — people fill their timesheet as they go, which is the whole
 * point of a draft.
 *
 * `now` is passed in rather than read here, so the boundary is testable and so
 * the whole request judges one moment: a call arriving at midnight on the 1st
 * must not decide the month twice.
 */
export function assertMonthIsFillable(
  month: number,
  year: number,
  now: Date,
): void {
  if (month < TIMESHEET_MIN_MONTH || month > TIMESHEET_MAX_MONTH) {
    throw new BadRequestException([
      `month must be between ${String(TIMESHEET_MIN_MONTH)} and ${String(TIMESHEET_MAX_MONTH)}`,
    ]);
  }

  const isFuture =
    year > now.getUTCFullYear() ||
    (year === now.getUTCFullYear() && month > now.getUTCMonth() + 1);

  if (isFuture) {
    throw new BadRequestException([
      `A timesheet cannot be opened for ${describePeriod(month, year)}: only the current month and past months may be filled in`,
    ]);
  }
}

/**
 * Refuses a rejection with nothing to act on.
 *
 * The reason is trimmed to `null` by the DTO, so a body carrying `"   "` arrives
 * here as an absence rather than satisfying a presence check while telling the
 * employee nothing. It is required because a refusal without one leaves somebody
 * unable to tell whether to fix a day, add a project or go and talk to their
 * manager — the same argument Feature 023 makes for `decisionReason`.
 */
export function assertRejectionReasonGiven(
  reason: string | null | undefined,
): asserts reason is string {
  if (reason === undefined || reason === null || reason.length === 0) {
    throw new BadRequestException([
      'rejectionReason is required when rejecting a timesheet',
    ]);
  }
}

/**
 * `September 2026` — how a period is named in a message somebody reads.
 *
 * Shared by the refusals here and by the notification wording, so the period a
 * caller is told about and the period an email announces are spelled the same
 * way. Month names rather than `2026-09`, because these strings are read by
 * people; the API's own parameters stay numeric.
 */
export function describePeriod(month: number, year: number): string {
  return `${MONTH_NAMES[month - TIMESHEET_MIN_MONTH] ?? String(month)} ${String(year)}`;
}

/**
 * The twelve months, in English, indexed from January.
 *
 * Not localised, and that is a limitation rather than a decision: this API has no
 * locale to render into, and every other human-readable string it produces is in
 * English too. The feature document records it beside the other
 * internationalisation work.
 */
const MONTH_NAMES: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
