import {
  toIsoTimestamp,
  toNullableIsoTimestamp,
} from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import type { LeaveRequestStatus } from '../../../generated/prisma/enums';
import type {
  DepartmentModel,
  EmployeeModel,
  LeaveRequestModel,
  LeaveTypeModel,
} from '../../../generated/prisma/models';

/**
 * A person, as a leave request names one.
 *
 * Declared as a `Pick` of the owning module's row rather than as a free-standing
 * interface, so renaming a column in `schema.prisma` breaks the build here
 * instead of producing a nested object with a field that no longer exists.
 *
 * The same shape serves all three roles a person plays on a request — the
 * requester, each replacement, and whoever processed it — because a screen
 * renders them identically: a name and the code beside it. Three near-identical
 * types would only invite one of them to drift.
 */
export type LeaveRequestEmployeeSummary = Pick<
  EmployeeModel,
  'id' | 'employeeCode' | 'firstName' | 'lastName'
>;

export type LeaveRequestDepartmentSummary = Pick<
  DepartmentModel,
  'id' | 'code' | 'name'
>;

/**
 * The requester, who carries their department and the others do not.
 *
 * `?departmentId=` filters the HR list on it: a client that can narrow by
 * department has to be able to show which one each row belongs to, and without
 * it every page would need a second request per employee. A replacement is not
 * filtered on, so repeating their department would be publishing a fact nobody
 * asked for once per nomination.
 */
export type LeaveRequestRequesterSummary = LeaveRequestEmployeeSummary & {
  department: LeaveRequestDepartmentSummary;
};

/**
 * The leave type, with the two presentation fields a requests table renders.
 *
 * `icon` and `color` are here so a row can be drawn the way the leave-type
 * screen draws it — the same call `BalanceLeaveTypeSummary` makes.
 * `requiresApproval` is deliberately absent even though this feature branches on
 * it: it describes the type, and the request's own `status` already says what
 * the branch decided. Publishing both would let a client compare a live type
 * against a decision taken months ago and conclude the API contradicted itself.
 */
export type LeaveRequestLeaveTypeSummary = Pick<
  LeaveTypeModel,
  'id' | 'code' | 'label' | 'icon' | 'color'
>;

/**
 * A leave request as the **employee's own** endpoints expose it.
 *
 * Four differences from the `leave_requests` row:
 *
 * 1. **The foreign keys are gone**, replaced by the records they point at — the
 *    same treatment `EmployeeEntity` gives `departmentId` and
 *    `EmployeeLeaveBalanceEntity` gives both of its. Nothing is lost: each
 *    nested object carries its `id`, which is what a form posts back.
 * 2. **The dates are strings**, ISO-8601, which is what the client actually
 *    receives once the body is serialised.
 * 3. **`requestedWorkingDays` is here and is in no column.** It is computed on
 *    every read from the work schedule, the public holidays and the span — see
 *    `WorkingDaysService` — which is what keeps those three the single source of
 *    truth about what a span is worth.
 * 4. **There is no `employee`.** This is the payload of `/api/v1/me/…`, where
 *    the person is the caller: repeating them on every row would echo back what
 *    the request already stated, and would be the one field a client could never
 *    act on. `LeaveRequestEntity` adds it for the HR list, where the rows are
 *    genuinely about different people.
 */
export interface MyLeaveRequestEntity {
  id: string;
  leaveType: LeaveRequestLeaveTypeSummary;
  startDate: string;
  endDate: string;
  /** Derived, never stored. See `WorkingDaysService`. */
  requestedWorkingDays: number;
  reason: string | null;
  status: LeaveRequestStatus;
  /** At least one, always — the API refuses a request without cover. */
  replacements: LeaveRequestEmployeeSummary[];
  /**
   * Who decided, or `null`.
   *
   * `null` on a request still `PENDING`, and also on one approved automatically
   * because its leave type requires no approval — there `processedAt` is set and
   * this is not, which is exactly how the two kinds of approval are told apart.
   */
  processedBy: LeaveRequestEmployeeSummary | null;
  processedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The same request as the **HR/Admin** endpoints expose it: everything above,
 * plus whose leave it is.
 *
 * An intersection rather than a second declaration, so the shared fields are
 * written once and the two payloads cannot drift into disagreeing about what a
 * leave request looks like.
 */
export type LeaveRequestEntity = MyLeaveRequestEntity & {
  employee: LeaveRequestRequesterSummary;
};

/**
 * The columns the `/me` endpoints read.
 *
 * A `select` rather than an `include`, and here that choice does real work: this
 * row joins to `employees`, which itself joins to `users` — `include` would
 * return every column of each, putting `User.passwordHash` one careless nesting
 * away from a leave screen, and would keep publishing every column added to
 * those tables later.
 *
 * `satisfies Prisma.LeaveRequestSelect` checks the keys against the model
 * without widening the constant, so a column renamed in `schema.prisma` breaks
 * the build here instead of at runtime.
 *
 * The replacements are ordered by surname then given name, so a request renders
 * its cover the same way on every request rather than in whatever order the rows
 * happened to be inserted.
 */
export const MY_LEAVE_REQUEST_SELECT = {
  id: true,
  startDate: true,
  endDate: true,
  reason: true,
  status: true,
  processedAt: true,
  decisionReason: true,
  leaveType: {
    select: { id: true, code: true, label: true, icon: true, color: true },
  },
  replacements: {
    orderBy: [
      { employee: { lastName: 'asc' } },
      { employee: { firstName: 'asc' } },
    ],
    select: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  },
  processedBy: {
    select: { id: true, employeeCode: true, firstName: true, lastName: true },
  },
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.LeaveRequestSelect;

/** The same columns, plus the requester the HR endpoints list across. */
export const LEAVE_REQUEST_PUBLIC_SELECT = {
  ...MY_LEAVE_REQUEST_SELECT,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      department: { select: { id: true, code: true, name: true } },
    },
  },
} as const satisfies Prisma.LeaveRequestSelect;

/**
 * A row read through {@link MY_LEAVE_REQUEST_SELECT}.
 *
 * Spelled as a `Pick` of the scalars plus the nested shapes, so a `select` left
 * off a query produces a row the mapper will not accept — the same compile-time
 * trip-wire every module here uses.
 */
export type MyLeaveRequestRow = Pick<
  LeaveRequestModel,
  | 'id'
  | 'startDate'
  | 'endDate'
  | 'reason'
  | 'status'
  | 'processedAt'
  | 'decisionReason'
  | 'createdAt'
  | 'updatedAt'
> & {
  leaveType: LeaveRequestLeaveTypeSummary;
  replacements: { employee: LeaveRequestEmployeeSummary }[];
  processedBy: LeaveRequestEmployeeSummary | null;
};

/** A row read through {@link LEAVE_REQUEST_PUBLIC_SELECT}. */
export type LeaveRequestRow = MyLeaveRequestRow & {
  employee: LeaveRequestRequesterSummary;
};

/**
 * The span a request covers, which is what the day count and every overlap
 * comparison are made of.
 *
 * Named because three separate concerns pass exactly these two dates around —
 * counting working days, checking the requester's own overlaps, checking each
 * replacement's — and a bare pair of `Date` arguments would eventually be handed
 * over in the wrong order.
 */
export interface LeaveSpan {
  readonly startDate: Date;
  readonly endDate: Date;
}

/**
 * Maps a row onto the resource the `/me` endpoints return.
 *
 * `requestedWorkingDays` is passed in rather than computed here, and that is the
 * shape the whole feature depends on: the count needs the work schedule and the
 * public holidays, so computing it inside a mapper would mean two queries per
 * row. The caller loads the calendar once and counts every row against it — see
 * `WorkingDaysService.createCalculator`.
 */
export function toMyLeaveRequestEntity(
  request: MyLeaveRequestRow,
  requestedWorkingDays: number,
): MyLeaveRequestEntity {
  return {
    id: request.id,
    leaveType: {
      id: request.leaveType.id,
      code: request.leaveType.code,
      label: request.leaveType.label,
      icon: request.leaveType.icon,
      color: request.leaveType.color,
    },
    startDate: toIsoTimestamp(request.startDate),
    endDate: toIsoTimestamp(request.endDate),
    requestedWorkingDays,
    reason: request.reason,
    status: request.status,
    replacements: request.replacements.map(({ employee }) =>
      toEmployeeSummary(employee),
    ),
    processedBy:
      request.processedBy === null
        ? null
        : toEmployeeSummary(request.processedBy),
    processedAt: toNullableIsoTimestamp(request.processedAt),
    decisionReason: request.decisionReason,
    createdAt: toIsoTimestamp(request.createdAt),
    updatedAt: toIsoTimestamp(request.updatedAt),
  };
}

/** Maps a row onto the resource the HR/Admin endpoints return. */
export function toLeaveRequestEntity(
  request: LeaveRequestRow,
  requestedWorkingDays: number,
): LeaveRequestEntity {
  return {
    ...toMyLeaveRequestEntity(request, requestedWorkingDays),
    employee: {
      ...toEmployeeSummary(request.employee),
      department: {
        id: request.employee.department.id,
        code: request.employee.department.code,
        name: request.employee.department.name,
      },
    },
  };
}

/** The one rendering of a person, used for all three roles they may play. */
function toEmployeeSummary(
  employee: LeaveRequestEmployeeSummary,
): LeaveRequestEmployeeSummary {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
  };
}
