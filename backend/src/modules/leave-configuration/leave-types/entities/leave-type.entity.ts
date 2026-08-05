import { toIsoTimestamp } from '../../../../common/utils/date.util';
import type { Prisma } from '../../../../generated/prisma/client';
import type { LeaveTypeModel } from '../../../../generated/prisma/models';

/**
 * A leave type as the API exposes it.
 *
 * It exists because the row and the resource are two different contracts that
 * only happen to agree today. Returning `LeaveTypeModel` straight from a handler
 * would make every column a published field, so a schema change — the balance
 * relation the next feature adds, an internal flag — would leak the moment it
 * was added instead of when someone decided to publish it.
 *
 * The visible difference is the timestamps: `Date` in the row, ISO-8601 strings
 * here, which is what the client actually receives once the body is serialised.
 * Declaring them as `string` makes the type honest and routes the format through
 * `toIsoTimestamp`, the project's single definition of it.
 *
 * `icon` is a string here for the same reason it is one in the column: it names
 * an icon rather than being one, so a client resolves it against whichever set
 * it ships and the API never has an opinion about how a leave type is drawn.
 */
export interface LeaveTypeEntity {
  id: string;
  code: string;
  label: string;
  icon: string;
  color: string | null;
  description: string | null;
  defaultAllocatedDays: number | null;
  /** Whether a year's remainder may still be taken in the next year. */
  allowsCarryOver: boolean;
  /** The ceiling on that remainder; `null` means no ceiling. */
  maxCarryOverDays: number | null;
  requiresApproval: boolean;
  isPaid: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * The columns every query in `LeaveTypesService` reads.
 *
 * A `select` rather than an `include`: `include` returns every column of the row
 * and would keep publishing each one added to `leave_types` later, whereas
 * `select` publishes a field only when someone decides to publish it. The table
 * has no relations today, which is exactly why the habit is worth keeping — the
 * first one added, when leave requests arrive, must not appear in a payload by
 * default.
 *
 * `satisfies Prisma.LeaveTypeSelect` checks the keys against the model without
 * widening the constant, so a column renamed in `schema.prisma` breaks the build
 * here instead of at runtime.
 */
export const LEAVE_TYPE_PUBLIC_SELECT = {
  id: true,
  code: true,
  label: true,
  icon: true,
  color: true,
  description: true,
  defaultAllocatedDays: true,
  allowsCarryOver: true,
  maxCarryOverDays: true,
  requiresApproval: true,
  isPaid: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.LeaveTypeSelect;

/**
 * A `leave_types` row read through {@link LEAVE_TYPE_PUBLIC_SELECT}.
 *
 * Spelled as a `Pick` of the model rather than as a free-standing interface, so
 * a `select` left off a query produces a row the mapper will not accept — the
 * same compile-time trip-wire the modules before this one use.
 */
export type LeaveTypeRow = Pick<
  LeaveTypeModel,
  keyof typeof LEAVE_TYPE_PUBLIC_SELECT
>;

/** Maps a `leave_types` row onto the resource returned by the endpoints. */
export function toLeaveTypeEntity(leaveType: LeaveTypeRow): LeaveTypeEntity {
  return {
    id: leaveType.id,
    code: leaveType.code,
    label: leaveType.label,
    icon: leaveType.icon,
    color: leaveType.color,
    description: leaveType.description,
    defaultAllocatedDays: leaveType.defaultAllocatedDays,
    allowsCarryOver: leaveType.allowsCarryOver,
    maxCarryOverDays: leaveType.maxCarryOverDays,
    requiresApproval: leaveType.requiresApproval,
    isPaid: leaveType.isPaid,
    isActive: leaveType.isActive,
    createdAt: toIsoTimestamp(leaveType.createdAt),
    updatedAt: toIsoTimestamp(leaveType.updatedAt),
  };
}
