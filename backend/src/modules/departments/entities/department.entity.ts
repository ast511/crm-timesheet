import { toIsoTimestamp } from '../../../common/utils/date.util';
import type { DepartmentModel } from '../../../generated/prisma/models';

/**
 * A department as the API exposes it.
 *
 * It exists because the row and the resource are two different contracts that
 * only happen to agree today. Returning `DepartmentModel` straight from a
 * handler would make every generated column a published field, so a schema
 * change — a `deletedAt` for soft deletes, an internal flag — would leak the
 * moment it was added instead of when someone decided to publish it.
 *
 * The visible difference is the timestamps: `Date` in the row, ISO-8601 strings
 * here, which is what the client actually receives once the body is serialised.
 * Declaring them as `string` makes the type honest and routes the format
 * through `toIsoTimestamp`, the project's single definition of it.
 */
export class DepartmentEntity {
  id!: string;
  code!: string;
  name!: string;
  description!: string | null;
  isActive!: boolean;
  createdAt!: string;
  updatedAt!: string;
}

/** Maps a `departments` row onto the resource returned by the endpoints. */
export function toDepartmentEntity(
  department: DepartmentModel,
): DepartmentEntity {
  return {
    id: department.id,
    code: department.code,
    name: department.name,
    description: department.description,
    isActive: department.isActive,
    createdAt: toIsoTimestamp(department.createdAt),
    updatedAt: toIsoTimestamp(department.updatedAt),
  };
}
