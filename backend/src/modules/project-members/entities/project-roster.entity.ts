import { PaginationMeta } from '../../../common/interfaces/pagination.interface';
import type { ProjectEntity } from '../../projects/entities/project.entity';
import type { ProjectMemberRosterEntry } from './project-member.entity';

/**
 * A project and the people on it — what
 * `GET /api/v1/projects/:projectId/members` returns.
 *
 * The project appears **once**, because the URL names it. Every member entry
 * carries only the person and the membership, which is the redundancy this
 * endpoint exists to remove: on the flat collection, filtering by one project
 * repeats the same project object on every row.
 *
 * `project` is the full {@link ProjectEntity}, not the five-field summary the
 * flat collection carries. Appearing once, it costs nothing to publish in full,
 * and it is the same representation `GET /api/v1/projects/:id` returns — so a
 * client rendering a project page with its team reads one payload instead of
 * two, and types the project once.
 *
 * `meta` describes **`members`**, not the project: it is the pagination block
 * every list endpoint in this API returns, and it means here exactly what it
 * means there. It is flat rather than nested inside `members` because `meta` has
 * one established meaning across the API, and `data.members.items` would be a
 * third level of nesting to say something the shape already says.
 */
export interface ProjectRosterEntity {
  project: ProjectEntity;
  members: ProjectMemberRosterEntry[];
  meta: PaginationMeta;
}
