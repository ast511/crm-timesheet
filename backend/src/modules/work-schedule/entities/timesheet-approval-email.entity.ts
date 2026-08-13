import { toIsoTimestamp } from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import type { TimesheetApprovalEmailModel } from '../../../generated/prisma/models';

/**
 * An approval address as the API exposes it.
 *
 * `id` is published here, unlike on the schedule itself, because it is the
 * value `DELETE /work-schedule/emails/:id` needs — a client cannot remove an
 * address it has no way to name.
 *
 * `workScheduleId` is deliberately **not** published. It would repeat the
 * collection the caller just addressed, and it can only ever hold one value; a
 * client that read it could do nothing with it that the URL did not already
 * tell it. Feature 015 made that the rule for sub-resources, and this is the
 * same shape.
 */
export class TimesheetApprovalEmailEntity {
  id!: string;
  email!: string;
  createdAt!: string;
}

/**
 * The columns every approval-email query reads.
 *
 * `satisfies Prisma.TimesheetApprovalEmailSelect` checks the keys against the
 * model without widening the constant, so a column renamed in `schema.prisma`
 * breaks the build here instead of at runtime.
 */
export const APPROVAL_EMAIL_PUBLIC_SELECT = {
  id: true,
  email: true,
  createdAt: true,
} as const satisfies Prisma.TimesheetApprovalEmailSelect;

/** A row read through {@link APPROVAL_EMAIL_PUBLIC_SELECT}. */
export type PublicApprovalEmailRow = Pick<
  TimesheetApprovalEmailModel,
  keyof typeof APPROVAL_EMAIL_PUBLIC_SELECT
>;

/** Maps a `timesheet_approval_emails` row onto the resource returned. */
export function toApprovalEmailEntity(
  approvalEmail: PublicApprovalEmailRow,
): TimesheetApprovalEmailEntity {
  return {
    id: approvalEmail.id,
    email: approvalEmail.email,
    createdAt: toIsoTimestamp(approvalEmail.createdAt),
  };
}
