import { IsBoolean, IsOptional } from 'class-validator';

import { IsIsoDateString } from '../../../common/decorators/is-iso-date-string.decorator';
import { ValidateIfPresent } from '../../../common/decorators/validate-if-present.decorator';

/**
 * Body of `PATCH /api/v1/projects/:projectId/members/:employeeId`.
 *
 * Every field is optional, and an absent one means "leave it alone" — Prisma
 * omits `undefined` from the `UPDATE`, so a partial body never blanks a column
 * the client did not mention.
 *
 * `projectId` and `employeeId` are **not** here. They are the primary key, they
 * are already in the URL, and accepting them in the body would mean either
 * ignoring them — a field that silently does nothing — or supporting a "move
 * this membership to another project" operation, which is not an edit of this
 * row but the creation of a different one. `forbidNonWhitelisted` turns an
 * attempt into a 400 naming the field rather than a surprise.
 *
 * Note which field carries `@IsOptional()` and which carry
 * `@ValidateIfPresent()`: `leftAt` is the only nullable column, so it is the
 * only field where `null` is a value rather than a mistake. Everywhere else
 * `null` is a 400, because `@IsOptional()` alone would skip the constraints and
 * let it through to a column that cannot hold it.
 */
export class UpdateProjectMemberDto {
  /**
   * Promotes or demotes the member.
   *
   * Nothing here enforces one manager per project. The schema does not, the
   * feature did not ask for it, and a rule invented in a `PATCH` handler is a
   * policy nobody can see — a project with two leads, or with none between one
   * person leaving and the next being named, is a situation this module records
   * rather than prevents.
   */
  @ValidateIfPresent()
  @IsBoolean()
  readonly isProjectManager?: boolean;

  /** Corrects the join date; `null` is rejected, the column cannot hold it. */
  @ValidateIfPresent()
  @IsIsoDateString()
  readonly joinedAt?: string;

  /**
   * Ends the membership — and, as `null`, reopens it.
   *
   * This is the whole lifecycle of a membership: setting `leftAt` makes it
   * inactive without deleting the history, and clearing it back to `null` is
   * how somebody rejoins a project they had left. The composite primary key
   * means a second row for the same pair is impossible, so reopening this one
   * is the *only* way to express a return.
   */
  @IsOptional()
  @IsIsoDateString()
  readonly leftAt?: string | null;
}
