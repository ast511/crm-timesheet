import { IsTimesheetRejectionReason } from './timesheet-management-field.decorators';

/**
 * Body of `POST /api/v1/timesheets/:id/reject`.
 *
 * One field, and it is **required** — which is the whole reason rejection is its
 * own endpoint with its own body rather than a status on a shared one. A refusal
 * without an explanation leaves the employee unable to tell whether to fix a day,
 * add a project or go and talk to somebody, and a month that comes back with no
 * reason will simply be resubmitted unchanged.
 *
 * There is no approval DTO to match it, and the asymmetry is deliberate: an
 * approval carries nothing a client could state. `POST /timesheets/:id/approve`
 * takes no body at all, and giving it an empty one would invite somebody to add
 * an optional "note" that a stored approval would then read as a caveat — the
 * same argument Feature 023 makes for refusing `decisionReason` on an approved
 * leave request.
 *
 * `reviewedByEmployeeId` and `reviewedAt` are absent too. The reviewer comes from
 * the `x-employee-id` header through `@CurrentUser()`, so a client cannot sign
 * somebody else's name to a decision, and the moment comes from the server rather
 * than from a clock this application does not run.
 */
export class RejectTimesheetDto {
  /**
   * Why the month was refused.
   *
   * Trimmed, and blank collapses to `null` — which the service then refuses, so
   * `"   "` cannot satisfy a presence check while saying nothing. It reaches the
   * employee in the rejection notification and is stored on the timesheet, where
   * it survives the resubmission: the reason is what they were asked to fix, and
   * blanking it the moment they act on it would leave the history of the month
   * unable to say why it took two attempts.
   */
  @IsTimesheetRejectionReason()
  readonly rejectionReason!: string;
}
