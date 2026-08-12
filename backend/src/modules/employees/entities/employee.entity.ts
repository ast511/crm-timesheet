import {
  toIsoTimestamp,
  toNullableIsoTimestamp,
} from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  EmployeeStatus,
  SeniorityLevel,
} from '../../../generated/prisma/enums';
import type {
  DepartmentModel,
  EmployeeModel,
  PositionModel,
  UserModel,
} from '../../../generated/prisma/models';

/**
 * The related records an employee is returned with.
 *
 * Each is declared as a `Pick` of the owning module's row rather than as a
 * free-standing interface, so renaming a column in `schema.prisma` breaks the
 * build here instead of producing a nested object with a field that no longer
 * exists.
 *
 * The user summary is the one that matters: it has no `passwordHash` for a
 * mapper to copy, which is the type-level half of the guarantee Feature 009
 * made. It is deliberately *not* `UserEntity` — that resource carries
 * `createdAt` and `updatedAt`, which describe the account rather than the
 * person, and an employee payload has no use for them.
 */
export type EmployeeDepartmentSummary = Pick<
  DepartmentModel,
  'id' | 'code' | 'name'
>;

export type EmployeePositionSummary = Pick<
  PositionModel,
  'id' | 'code' | 'name'
>;

/**
 * The account behind an employee, as an employee record renders it.
 *
 * `status` replaced `isActive` in Feature 036 — see [AccountStatus] in
 * `schema.prisma`. It matters more here than it looks: an employee list is where
 * somebody notices that a colleague hired last week has still not accepted their
 * invitation, and a boolean could not say so.
 */
export type EmployeeUserSummary = Pick<
  UserModel,
  'id' | 'email' | 'username' | 'role' | 'status'
>;

/**
 * An employee as the API exposes it.
 *
 * Two differences from the `employees` row, and both are the point:
 *
 * 1. **The foreign keys are gone.** `userId`, `departmentId` and `positionId`
 *    are replaced by the records they point at, so a client renders a
 *    department without a second request. Nothing is lost — each nested object
 *    carries its `id`, which is what a form posts back.
 * 2. **The dates are strings.** `Date` in PostgreSQL, ISO-8601 here, which is
 *    what the client actually receives once the body is serialised. Declaring
 *    them as `string` makes the type honest and routes the format through
 *    `toIsoTimestamp`, the project's single definition of it.
 *
 * `hireDate` is rendered as a full instant rather than truncated to
 * `YYYY-MM-DD`, because the column is a `timestamp` and the seed writes UTC
 * midnight: printing only the date would quietly assume a timezone this module
 * has no way to know.
 */
export interface EmployeeEntity {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  hireDate: string;
  /**
   * The day the person left, or `null` while they still work here.
   *
   * Added by Feature 030, which bounds a timesheet's entries at
   * `[hireDate, terminationDate ?? today]`. Independent of `status` — somebody
   * serving notice is `ACTIVE` and has a termination date — so a client renders
   * both rather than deriving one from the other.
   */
  terminationDate: string | null;
  seniority: SeniorityLevel;
  status: EmployeeStatus;
  canReplaceOthers: boolean;
  department: EmployeeDepartmentSummary;
  position: EmployeePositionSummary;
  user: EmployeeUserSummary;
  createdAt: string;
  updatedAt: string;
}

/**
 * The columns every query in `EmployeeService` reads.
 *
 * A `select` rather than an `include`, and that is a deliberate choice:
 * `include` returns *every* column of each related row — including
 * `User.passwordHash`, which must never leave PostgreSQL — and would keep
 * returning every column added to those tables later. `select` publishes a
 * field only when someone decides to publish it.
 *
 * `satisfies Prisma.EmployeeSelect` checks the keys against the model without
 * widening the constant, so a column renamed in `schema.prisma` breaks the
 * build here instead of at runtime.
 */
export const EMPLOYEE_PUBLIC_SELECT = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  phone: true,
  hireDate: true,
  terminationDate: true,
  seniority: true,
  status: true,
  canReplaceOthers: true,
  department: { select: { id: true, code: true, name: true } },
  position: { select: { id: true, code: true, name: true } },
  user: {
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      status: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.EmployeeSelect;

/**
 * An `employees` row read through {@link EMPLOYEE_PUBLIC_SELECT}.
 *
 * Spelled as a `Pick` of the scalars plus the three summaries, so a `select`
 * left off a query produces a row the mapper will not accept — the same
 * compile-time trip-wire `PublicUserRow` gives the users module.
 */
export type EmployeeWithRelationsRow = Pick<
  EmployeeModel,
  | 'id'
  | 'employeeCode'
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'hireDate'
  | 'terminationDate'
  | 'seniority'
  | 'status'
  | 'canReplaceOthers'
  | 'createdAt'
  | 'updatedAt'
> & {
  department: EmployeeDepartmentSummary;
  position: EmployeePositionSummary;
  user: EmployeeUserSummary;
};

/** Maps an `employees` row onto the resource returned by the endpoints. */
export function toEmployeeEntity(
  employee: EmployeeWithRelationsRow,
): EmployeeEntity {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
    phone: employee.phone,
    hireDate: toIsoTimestamp(employee.hireDate),
    terminationDate: toNullableIsoTimestamp(employee.terminationDate),
    seniority: employee.seniority,
    status: employee.status,
    canReplaceOthers: employee.canReplaceOthers,
    department: {
      id: employee.department.id,
      code: employee.department.code,
      name: employee.department.name,
    },
    position: {
      id: employee.position.id,
      code: employee.position.code,
      name: employee.position.name,
    },
    user: {
      id: employee.user.id,
      email: employee.user.email,
      username: employee.user.username,
      role: employee.user.role,
      status: employee.user.status,
    },
    createdAt: toIsoTimestamp(employee.createdAt),
    updatedAt: toIsoTimestamp(employee.updatedAt),
  };
}
