import {
  toIsoTimestamp,
  toNullableIsoTimestamp,
} from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  EmployeeModel,
  ProjectMemberModel,
  ProjectModel,
} from '../../../generated/prisma/models';
import type {
  EmployeeDepartmentSummary,
  EmployeePositionSummary,
} from '../../employees/entities/employee.entity';

/**
 * The project a membership points at, as a membership publishes it.
 *
 * A `Pick` of the owning module's row rather than a free-standing interface, so
 * renaming a column in `schema.prisma` breaks the build here instead of
 * producing a nested object with a field that no longer exists.
 *
 * Deliberately *not* `ProjectEntity`: that resource carries the description,
 * the estimate, the lifecycle flags and its own timestamps, none of which say
 * anything about this person's membership. What a client renders next to a name
 * is a label and an accent colour, and that is what is published.
 */
export type ProjectMemberProjectSummary = Pick<
  ProjectModel,
  'id' | 'code' | 'name' | 'clientName' | 'color'
>;

/**
 * The employee a membership points at, with the two records that place them in
 * the organisation.
 *
 * `EmployeeDepartmentSummary` and `EmployeePositionSummary` are imported from
 * the employees module rather than redeclared: they are the same three columns
 * for the same reason, and one definition means a change to either shape
 * reaches both payloads at once.
 *
 * There is no `user` here, unlike `EmployeeEntity`. A membership is about who
 * works on a project, not about how they sign in, and an account is not
 * something a project roster has any use for.
 */
export type ProjectMemberEmployeeSummary = Pick<
  EmployeeModel,
  'id' | 'employeeCode' | 'firstName' | 'lastName' | 'seniority' | 'status'
> & {
  department: EmployeeDepartmentSummary;
  position: EmployeePositionSummary;
};

/**
 * The membership itself: the columns that belong to neither side.
 *
 * Every payload in this module carries these three and then adds whichever of
 * the two sides its endpoint does not already name. Declared once so the three
 * shapes cannot drift, and so "what is a membership, stripped of who and what"
 * has an answer in the code.
 *
 * The dates are strings: `Date` in PostgreSQL, ISO-8601 here, which is what the
 * client actually receives once the body is serialised. Declaring them as
 * `string` makes the type honest and routes the format through `toIsoTimestamp`,
 * the project's single definition of it.
 */
export interface ProjectMembershipPeriod {
  isProjectManager: boolean;
  joinedAt: string;
  leftAt: string | null;
}

/**
 * One line of a project's roster: a person, and the membership.
 *
 * No `project`, and that is the point of the type — it is what
 * `GET /api/v1/projects/:projectId/members` returns for each member, where the
 * project is named by the URL and published once beside the list.
 */
export interface ProjectMemberRosterEntry extends ProjectMembershipPeriod {
  employee: ProjectMemberEmployeeSummary;
}

/**
 * One line of an employee's assignments: a project, and the membership.
 *
 * The exact mirror of {@link ProjectMemberRosterEntry}, for
 * `GET /api/v1/employees/:employeeId/projects`, where it is the *employee* that
 * the URL names and that would otherwise repeat on every row.
 *
 * The two types are deliberately symmetrical rather than merged into one with
 * both sides optional: an optional field is a question every consumer has to
 * ask at runtime, while these two say at compile time exactly which side their
 * endpoint supplies.
 */
export interface ProjectMemberAssignmentEntry extends ProjectMembershipPeriod {
  project: ProjectMemberProjectSummary;
}

/**
 * Note what is *not* here: a shape carrying both sides at once.
 *
 * There was one until Feature 015 — `ProjectMemberEntity`, for the unscoped
 * `/api/v1/project-members` listing. Once every endpoint became scoped, nothing
 * needed it: each URL names one side, so each payload publishes the other. A
 * type that no endpoint returns is dead weight, and the two mirrors above cover
 * the whole API surface.
 *
 * The foreign keys are gone from both, replaced by the records they point at —
 * the same treatment `EmployeeEntity` gives `departmentId` and `positionId`.
 * Nothing is lost: each nested object carries its `id`, which is what a caller
 * puts back in a URL.
 */

/**
 * The membership's own columns — the half of every `select` in this module that
 * is the same whichever side is being published.
 *
 * A `select` rather than an `include` throughout, and here that choice does the
 * most work of any module. This row joins to two tables that themselves join to
 * two more; `include` would return every column of each — an employee's
 * `phone`, `maxVacationDays` and `hireDate`, a project's description and
 * estimate, a department's `isActive` — and, through `Employee.user`, would put
 * `User.passwordHash` one careless nesting away from a roster endpoint. It
 * would also keep publishing every column added to any of those five tables
 * later. `select` publishes a field only when someone decides to publish it,
 * and it is what keeps a fifty-row page proportional to what the page renders.
 *
 * `satisfies Prisma.ProjectMemberSelect` on each composed constant checks the
 * keys against the model without widening it, so a column renamed in
 * `schema.prisma` breaks the build here instead of at runtime.
 */
const MEMBERSHIP_SELECT = {
  isProjectManager: true,
  joinedAt: true,
  leftAt: true,
} as const;

/** The employee side, published wherever the URL does not already name it. */
const MEMBER_EMPLOYEE_SELECT = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      seniority: true,
      status: true,
      department: { select: { id: true, code: true, name: true } },
      position: { select: { id: true, code: true, name: true } },
    },
  },
} as const;

/** The project side, on the same terms. */
const MEMBER_PROJECT_SELECT = {
  project: {
    select: {
      id: true,
      code: true,
      name: true,
      clientName: true,
      color: true,
    },
  },
} as const;

/** What a project's roster reads: the membership and the person. */
export const PROJECT_MEMBER_ROSTER_SELECT = {
  ...MEMBERSHIP_SELECT,
  ...MEMBER_EMPLOYEE_SELECT,
} as const satisfies Prisma.ProjectMemberSelect;

/** What an employee's assignments read: the membership and the project. */
export const PROJECT_MEMBER_ASSIGNMENT_SELECT = {
  ...MEMBERSHIP_SELECT,
  ...MEMBER_PROJECT_SELECT,
} as const satisfies Prisma.ProjectMemberSelect;

/**
 * A `project_members` row, in the two shapes the two selects produce.
 *
 * Spelled as a `Pick` of the scalars plus whichever summary was read, so a
 * `select` left off a query produces a row the mapper will not accept — the
 * same compile-time trip-wire `EmployeeWithRelationsRow` gives the employees
 * module.
 *
 * `projectId` and `employeeId` are absent because neither select reads them:
 * one side is published as a nested record carrying its `id`, the other is
 * named by the URL, and reading a value twice is how two spellings eventually
 * disagree.
 */
export type ProjectMembershipRow = Pick<
  ProjectMemberModel,
  'isProjectManager' | 'joinedAt' | 'leftAt'
>;

export type ProjectMemberRosterRow = ProjectMembershipRow & {
  employee: ProjectMemberEmployeeSummary;
};

export type ProjectMemberAssignmentRow = ProjectMembershipRow & {
  project: ProjectMemberProjectSummary;
};

/** Maps the membership's own columns; the three mappers below all use it. */
function toMembershipPeriod(
  member: ProjectMembershipRow,
): ProjectMembershipPeriod {
  return {
    isProjectManager: member.isProjectManager,
    joinedAt: toIsoTimestamp(member.joinedAt),
    leftAt: toNullableIsoTimestamp(member.leftAt),
  };
}

/** Maps the employee side. */
function toEmployeeSummary(
  employee: ProjectMemberEmployeeSummary,
): ProjectMemberEmployeeSummary {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
    seniority: employee.seniority,
    status: employee.status,
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
  };
}

/** Maps the project side. */
function toProjectSummary(
  project: ProjectMemberProjectSummary,
): ProjectMemberProjectSummary {
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    clientName: project.clientName,
    color: project.color,
  };
}

/**
 * Maps a row onto a roster entry — the membership without the project, for the
 * endpoint whose URL already names it.
 */
export function toProjectMemberRosterEntry(
  member: ProjectMemberRosterRow,
): ProjectMemberRosterEntry {
  return {
    employee: toEmployeeSummary(member.employee),
    ...toMembershipPeriod(member),
  };
}

/**
 * Maps a row onto an assignment entry — the mirror of the above.
 *
 * The two are composed from the same three small mappers, exactly as the two
 * selects are composed from the same three constants, so no payload in this
 * module can describe the same person or the same project differently from
 * another.
 */
export function toProjectMemberAssignmentEntry(
  member: ProjectMemberAssignmentRow,
): ProjectMemberAssignmentEntry {
  return {
    project: toProjectSummary(member.project),
    ...toMembershipPeriod(member),
  };
}
