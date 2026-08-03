import { IsBoolean, IsIn, IsOptional } from 'class-validator';

import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';
import { SortQueryDto } from '../../../common/dto/sort-query.dto';
import {
  DEFAULT_PROJECT_MEMBER_SORT_FIELD,
  PROJECT_MEMBER_SORT_FIELDS,
  ProjectMemberSortField,
} from '../project-member.constants';

/**
 * The query string of both endpoints that list memberships:
 * `GET /api/v1/projects/:projectId/members` and
 * `GET /api/v1/employees/:employeeId/projects`.
 *
 * One class for both, because the two filters below mean exactly the same thing
 * on each — they narrow *within* a scope, and only the scope differs. Extends
 * `SortQueryDto` — and, through it, `PaginationQueryDto` — so the shared
 * defaults, the page-size cap and the direction vocabulary apply without being
 * restated.
 *
 * **There is no `?projectId=` and no `?employeeId=`.** Feature 015 removed
 * both, along with the `/api/v1/project-members` collection they belonged to.
 * Each had exactly one job — "who is on this project", "what is this person
 * working on" — and each is now a URL that says so, answering without repeating
 * the thing being scoped to on every row. Two ways to ask one question is a
 * cost paid forever in documentation, tests and "which one do we use?", and the
 * filters were the worse of the two: an unknown id answered with an empty page
 * instead of a `404`, and the answer carried N copies of a value the caller had
 * just supplied.
 *
 * There is no `?search=` either. A membership has no text of its own to match:
 * what a caller would search for — a name, a project code — belongs to the
 * related rows, and matching across a join is a different feature from the
 * substring search the other modules offer.
 */
export class ProjectMemberQueryDto extends SortQueryDto {
  /** `?isProjectManager=true` / `=false`; anything else is a 400. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly isProjectManager?: boolean;

  /**
   * `?activeOnly=true` keeps only the memberships that have not ended —
   * `leftAt IS NULL`.
   *
   * `false` and *absent* mean the same thing, and the parameter is named for
   * that: "only the active ones" turned off is not "only the inactive ones", it
   * is the unfiltered listing. Historical memberships are part of the record,
   * so they are returned by default; a caller who wants the current state asks
   * for it explicitly.
   *
   * The complement — memberships that *have* ended — is deliberately not
   * offered. Nobody has asked for it, and adding `?endedOnly=` alongside this
   * would create a pair of flags that can contradict each other.
   */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly activeOnly?: boolean;

  /** Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
  @IsOptional()
  @IsIn(PROJECT_MEMBER_SORT_FIELDS)
  readonly sortBy: ProjectMemberSortField = DEFAULT_PROJECT_MEMBER_SORT_FIELD;
}
