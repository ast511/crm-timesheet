import { toIsoTimestamp } from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  DepartmentModel,
  EmployeeLeaveBalanceModel,
  EmployeeModel,
  LeaveTypeModel,
} from '../../../generated/prisma/models';

/**
 * The related records a balance is returned with.
 *
 * Each is declared as a `Pick` of the owning module's row rather than as a
 * free-standing interface, so renaming a column in `schema.prisma` breaks the
 * build here instead of producing a nested object with a field that no longer
 * exists.
 *
 * The employee summary carries the department, because `?departmentId=` filters
 * on it: a client that can narrow by department has to be able to show which
 * one each row belongs to, and without it every page would need a second
 * request per employee.
 */
export type BalanceDepartmentSummary = Pick<
  DepartmentModel,
  'id' | 'code' | 'name'
>;

export type BalanceEmployeeSummary = Pick<
  EmployeeModel,
  'id' | 'employeeCode' | 'firstName' | 'lastName'
> & { department: BalanceDepartmentSummary };

/**
 * The leave type, with the two presentation fields a balances table renders.
 *
 * `icon` and `color` are here so a row can be drawn the same way the leave-type
 * screen draws it. `requiresApproval`, `isPaid` and `defaultAllocatedDays` are
 * not: they describe the type, and a client that needs them asks
 * `/api/v1/leave-types` — repeating them on every balance would publish the same
 * facts once per row and turn a change to a type into stale data everywhere.
 */
export type BalanceLeaveTypeSummary = Pick<
  LeaveTypeModel,
  'id' | 'code' | 'label' | 'icon' | 'color'
>;

/**
 * A leave balance as the API exposes it.
 *
 * Three differences from the `employee_leave_balances` row:
 *
 * 1. **The foreign keys are gone**, replaced by the records they point at — the
 *    same treatment `EmployeeEntity` gives `departmentId` and `positionId`.
 *    Nothing is lost: each nested object carries its `id`, which is what a form
 *    posts back.
 * 2. **The dates are strings**, ISO-8601, which is what the client actually
 *    receives once the body is serialised.
 * 3. **`remainingDays` is here and is in no column.** It is computed on every
 *    read — see {@link computeRemainingDays} — which is what keeps the three
 *    stored numbers the single source of truth.
 */
export interface EmployeeLeaveBalanceEntity {
  id: string;
  employee: BalanceEmployeeSummary;
  leaveType: BalanceLeaveTypeSummary;
  year: number;
  allocatedDays: number;
  carriedOverDays: number;
  usedDays: number;
  /** Derived, never stored. `allocated + carriedOver - used`. */
  remainingDays: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The columns every query in `EmployeeLeaveBalancesService` reads.
 *
 * A `select` rather than an `include`, and here that choice does real work: this
 * row joins to `employees`, which itself joins to `departments`, `positions` and
 * `users` — `include` would return every column of each, putting
 * `User.passwordHash` one careless nesting away from a balances page, and would
 * keep publishing every column added to those tables later.
 *
 * `satisfies Prisma.EmployeeLeaveBalanceSelect` checks the keys against the
 * model without widening the constant, so a column renamed in `schema.prisma`
 * breaks the build here instead of at runtime.
 */
export const LEAVE_BALANCE_PUBLIC_SELECT = {
  id: true,
  year: true,
  allocatedDays: true,
  carriedOverDays: true,
  usedDays: true,
  notes: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      department: { select: { id: true, code: true, name: true } },
    },
  },
  leaveType: {
    select: { id: true, code: true, label: true, icon: true, color: true },
  },
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.EmployeeLeaveBalanceSelect;

/**
 * A row read through {@link LEAVE_BALANCE_PUBLIC_SELECT}.
 *
 * Spelled as a `Pick` of the scalars plus the two summaries, so a `select` left
 * off a query produces a row the mapper will not accept — the same compile-time
 * trip-wire every module here uses.
 */
export type LeaveBalanceRow = Pick<
  EmployeeLeaveBalanceModel,
  | 'id'
  | 'year'
  | 'allocatedDays'
  | 'carriedOverDays'
  | 'usedDays'
  | 'notes'
  | 'createdAt'
  | 'updatedAt'
> & {
  employee: BalanceEmployeeSummary;
  leaveType: BalanceLeaveTypeSummary;
};

/**
 * The whole of the `remainingDays` rule, written once.
 *
 * `allocatedDays + carriedOverDays - usedDays`. Every endpoint that publishes a
 * balance runs it, and nothing else computes it — which is what makes the
 * formula a single decision rather than one repeated in a list handler, a detail
 * handler and two write handlers, where the fourth copy is the one that
 * eventually forgets `carriedOverDays`.
 *
 * **It may return a negative number, and that is deliberate.** If HR reduces an
 * allocation after days have already been taken — or opens a balance for
 * somebody who joined mid-year having used more than they were given — the
 * honest answer is that the person is overdrawn. Clamping it at zero would hide
 * exactly the situation somebody needs to see, and refusing to store it would
 * block a correction that is the reason the screen exists. Nothing in this
 * feature acts on the number; the Leave Requests feature will decide what an
 * overdrawn balance means for a new request.
 */
export function computeRemainingDays({
  allocatedDays,
  carriedOverDays,
  usedDays,
}: Pick<
  EmployeeLeaveBalanceModel,
  'allocatedDays' | 'carriedOverDays' | 'usedDays'
>): number {
  return allocatedDays + carriedOverDays - usedDays;
}

/** Maps a row onto the resource returned by the endpoints. */
export function toLeaveBalanceEntity(
  balance: LeaveBalanceRow,
): EmployeeLeaveBalanceEntity {
  return {
    id: balance.id,
    employee: {
      id: balance.employee.id,
      employeeCode: balance.employee.employeeCode,
      firstName: balance.employee.firstName,
      lastName: balance.employee.lastName,
      department: {
        id: balance.employee.department.id,
        code: balance.employee.department.code,
        name: balance.employee.department.name,
      },
    },
    leaveType: {
      id: balance.leaveType.id,
      code: balance.leaveType.code,
      label: balance.leaveType.label,
      icon: balance.leaveType.icon,
      color: balance.leaveType.color,
    },
    year: balance.year,
    allocatedDays: balance.allocatedDays,
    carriedOverDays: balance.carriedOverDays,
    usedDays: balance.usedDays,
    remainingDays: computeRemainingDays(balance),
    notes: balance.notes,
    createdAt: toIsoTimestamp(balance.createdAt),
    updatedAt: toIsoTimestamp(balance.updatedAt),
  };
}
