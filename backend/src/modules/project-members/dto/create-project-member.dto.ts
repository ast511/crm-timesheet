import { IsBoolean, IsOptional } from 'class-validator';

import { IsIsoDateString } from '../../../common/decorators/is-iso-date-string.decorator';
import { IsRelationId } from '../../../common/decorators/is-relation-id.decorator';
import { ValidateIfPresent } from '../../../common/decorators/validate-if-present.decorator';

/**
 * Body of `POST /api/v1/projects/:projectId/members`.
 *
 * There is no field-decorator file beside this one, unlike the five modules
 * before it, and its absence is the point: every constraint a membership needs
 * already exists in `common/decorators`, because a membership has no columns of
 * its own beyond two foreign keys, a flag and two dates. Writing
 * `IsProjectMemberDate()` here would have been a third copy of a rule stated
 * twice already.
 *
 * **`projectId` is not here.** It was, until Feature 015 moved the endpoint
 * under the project it creates a membership in; now the path carries it, the
 * same way `PATCH` and `DELETE` have always carried it. A body field would be
 * a second place to say one thing, and the two could disagree.
 *
 * `employeeId` is the only id left, and it is the only field that cannot be
 * changed afterwards — `UpdateProjectMemberDto` omits it, because moving a
 * membership to a different person is not an edit, it is a different
 * membership.
 *
 * Whether `leftAt` falls on or after `joinedAt` is not checked here. It is a
 * rule about two fields at once, and on `PATCH` it has to be answered against
 * the values already stored — so it lives in the service, where both halves are
 * available. This class only checks the shape of what arrived.
 *
 * Unknown properties never reach it: the global `ValidationPipe` runs with
 * `forbidNonWhitelisted`, so a typo in a payload — or a stray `projectId` — is
 * a 400 rather than a silently ignored field.
 */
export class CreateProjectMemberDto {
  @IsRelationId()
  readonly employeeId!: string;

  /**
   * Omitted, the schema's `false` applies — most members are not the manager.
   * `null` is not the same request and is rejected: the column is not nullable,
   * so it has nothing to store.
   */
  @ValidateIfPresent()
  @IsBoolean()
  readonly isProjectManager?: boolean;

  /**
   * When the person joined. Optional, because "now" is the honest answer for a
   * membership created as it happens; a backdated one states its own date.
   *
   * `null` is rejected for the same reason as `isProjectManager`. Note that an
   * omission is resolved to the current time *by the service* rather than by
   * the column's `@default(now())` — see `ProjectMemberService.create`.
   */
  @ValidateIfPresent()
  @IsIsoDateString()
  readonly joinedAt?: string;

  /**
   * When the person left, and the one nullable column on the table.
   *
   * A membership created with a `leftAt` is a historical one being recorded
   * after the fact — an import, or a backfill of who worked on a project last
   * year — which is why this is accepted on creation rather than only on the
   * `PATCH` that ends an active membership.
   */
  @IsOptional()
  @IsIsoDateString()
  readonly leftAt?: string | null;
}
