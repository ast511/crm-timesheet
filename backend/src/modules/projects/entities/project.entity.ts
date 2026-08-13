import {
  toIsoTimestamp,
  toNullableIsoTimestamp,
} from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  ProjectPriority,
  ProjectStatus,
} from '../../../generated/prisma/enums';
import type { ProjectModel } from '../../../generated/prisma/models';

/**
 * A project as the API exposes it.
 *
 * It exists because the row and the resource are two different contracts that
 * only happen to agree today. Returning `ProjectModel` straight from a handler
 * would make every generated column a published field, so a schema change — a
 * `deletedAt` for soft deletes, an internal margin — would leak the moment it
 * was added instead of when someone decided to publish it.
 *
 * The visible difference is the dates: `Date` in the row, ISO-8601 strings
 * here, which is what the client actually receives once the body is serialised.
 * Declaring them as `string` makes the type honest and routes the format
 * through `toIsoTimestamp`, the project's single definition of it.
 *
 * `startDate` and `endDate` are rendered as full instants rather than truncated
 * to `YYYY-MM-DD`, for the reason `Employee.hireDate` is: the columns are
 * `timestamp` and the seed writes UTC midnight, so printing only the date would
 * quietly assume a timezone this module has no way to know.
 */
export class ProjectEntity {
  id!: string;
  code!: string;
  name!: string;
  clientName!: string;
  description!: string | null;
  estimatedHours!: number;
  color!: string | null;
  projectStatus!: ProjectStatus;
  projectPriority!: ProjectPriority;
  isArchived!: boolean;
  startDate!: string | null;
  endDate!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

/**
 * The columns every query in `ProjectService` reads.
 *
 * A `select` rather than an `include`, and that is a deliberate choice.
 * `include` returns *every* column of the row plus whole related records —
 * here that would drag each project's `memberships` into a listing that has no
 * use for them, and would keep publishing every column added to `projects`
 * later. `select` publishes a field only when someone decides to publish it,
 * and it is what keeps the payload of a fifty-row page proportional to what the
 * page actually renders.
 *
 * `satisfies Prisma.ProjectSelect` checks the keys against the model without
 * widening the constant, so a column renamed in `schema.prisma` breaks the
 * build here instead of at runtime.
 */
export const PROJECT_PUBLIC_SELECT = {
  id: true,
  code: true,
  name: true,
  clientName: true,
  description: true,
  estimatedHours: true,
  color: true,
  projectStatus: true,
  projectPriority: true,
  isArchived: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ProjectSelect;

/**
 * A `projects` row read through {@link PROJECT_PUBLIC_SELECT}.
 *
 * Spelled as a `Pick` of the model rather than as a free-standing interface, so
 * a `select` left off a query produces a row the mapper will not accept — the
 * same compile-time trip-wire the users and employees modules use.
 */
export type PublicProjectRow = Pick<
  ProjectModel,
  keyof typeof PROJECT_PUBLIC_SELECT
>;

/** Maps a `projects` row onto the resource returned by the endpoints. */
export function toProjectEntity(project: PublicProjectRow): ProjectEntity {
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    clientName: project.clientName,
    description: project.description,
    estimatedHours: project.estimatedHours,
    color: project.color,
    projectStatus: project.projectStatus,
    projectPriority: project.projectPriority,
    isArchived: project.isArchived,
    startDate: toNullableIsoTimestamp(project.startDate),
    endDate: toNullableIsoTimestamp(project.endDate),
    createdAt: toIsoTimestamp(project.createdAt),
    updatedAt: toIsoTimestamp(project.updatedAt),
  };
}
