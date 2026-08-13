import { toIsoTimestamp } from '../../../common/utils/date.util';
import type { PositionModel } from '../../../generated/prisma/models';

/**
 * A position as the API exposes it.
 *
 * It exists because the row and the resource are two different contracts that
 * only happen to agree today. Returning `PositionModel` straight from a handler
 * would make every generated column a published field, so a schema change — a
 * `deletedAt` for soft deletes, an internal flag — would leak the moment it was
 * added instead of when someone decided to publish it.
 *
 * The visible difference is the timestamps: `Date` in the row, ISO-8601 strings
 * here, which is what the client actually receives once the body is serialised.
 * Declaring them as `string` makes the type honest and routes the format
 * through `toIsoTimestamp`, the project's single definition of it.
 */
export class PositionEntity {
  id!: string;
  code!: string;
  name!: string;
  description!: string | null;
  isActive!: boolean;
  createdAt!: string;
  updatedAt!: string;
}

/** Maps a `positions` row onto the resource returned by the endpoints. */
export function toPositionEntity(position: PositionModel): PositionEntity {
  return {
    id: position.id,
    code: position.code,
    name: position.name,
    description: position.description,
    isActive: position.isActive,
    createdAt: toIsoTimestamp(position.createdAt),
    updatedAt: toIsoTimestamp(position.updatedAt),
  };
}
