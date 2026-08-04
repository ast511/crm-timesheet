import { IsIn, IsOptional } from 'class-validator';

import {
  LEAVE_REQUEST_DECISIONS,
  LeaveRequestDecision,
} from '../leave-request.constants';
import { IsLeaveDecisionReason } from './leave-request-field.decorators';

/**
 * Body of `PATCH /api/v1/leave-requests/:id/status` — the HR/Admin decision.
 *
 * A dedicated endpoint with a two-field body rather than another field on the
 * employee's `PATCH`, and the separation is the point: deciding a request is a
 * different action, taken by a different person, with different consequences.
 * Approving moves days out of a balance; editing a span does not. Two verbs on
 * one route would have made "did this write touch the ledger" a question about
 * which fields the body happened to carry.
 *
 * **`PENDING` is not accepted**, which is what closes the loop the balances
 * depend on: there is no way back into the undecided state, so a request whose
 * days have been deducted cannot be re-decided into deducting them twice, and
 * cannot be quietly un-approved leaving the deduction behind. The service also
 * refuses a request that is *already* decided, for the same reason — the state
 * machine has exactly one transition, out of `PENDING`.
 *
 * **`processedById` and `processedAt` are absent, and sending either is a
 * `400`.** They are the record of who decided and when; a client stating them
 * would be signing somebody else's name. The service takes the decider from the
 * `x-employee-id` header and the moment from the transaction that writes the
 * decision.
 */
export class UpdateLeaveRequestStatusDto {
  /**
   * The decision: `APPROVED`, `REJECTED` or `CANCELLED`.
   *
   * `@IsIn` over the closed list rather than `@IsEnum(LeaveRequestStatus)`,
   * because the enum has a fourth member this endpoint must refuse. `@IsEnum`
   * would have accepted `PENDING` and left the rejection to the service, which
   * is a rule about the *shape of the body* enforced one layer too late.
   */
  @IsIn(LEAVE_REQUEST_DECISIONS)
  readonly status!: LeaveRequestDecision;

  /**
   * Why — **required for `REJECTED` and `CANCELLED`, refused for `APPROVED`**.
   *
   * Optional here and conditional in the service, because the rule is about two
   * fields at once and class-validator can only express it as a condition on a
   * value this class has no reason to inspect twice. The service checks it
   * against the resolved status, beside the other statements about what a valid
   * decision is, and reports a `400` naming the field either way.
   *
   * Refusing it on an approval is deliberate rather than lenient: a stored
   * explanation for a request that was granted would be read as a caveat, and
   * nothing in the API would say whether the leave was conditional.
   */
  @IsOptional()
  @IsLeaveDecisionReason()
  readonly decisionReason?: string | null;
}
