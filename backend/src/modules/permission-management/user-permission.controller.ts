import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import {
  ApiCreatedEnvelope,
  ApiOkEnvelope,
  ApiOkPageEnvelope,
} from '../../common/swagger/api-envelope-response.decorator';
import { ApiStandardErrors } from '../../common/swagger/api-standard-errors.decorator';
import { API_TAG } from '../../config/swagger-tags';
import { BEARER_AUTH_NAME } from '../../config/swagger.setup';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { ApplyPresetDto } from './dto/apply-preset.dto';
import { PermissionHistoryQueryDto } from './dto/permission-history-query.dto';
import { SetUserPermissionsDto } from './dto/set-user-permissions.dto';
import { PermissionAuditLogEntity } from './entities/permission-audit-log.entity';
import { UserPermissionMatrixEntity } from './entities/user-permission-matrix.entity';
import { UserPermissionService } from './user-permission.service';

/**
 * `/api/v1/users/:id/permissions` — one person's permission matrix, the three
 * ways to change it, and the record of who changed it.
 *
 * **Mounted on `users` but owned by this module**, and that is deliberate.
 * Feature 015 settled the shape: a sub-resource lives at the URL of the thing it
 * belongs to, because "this user's permissions" is one question and should have
 * one address rather than a `/permissions?userId=` that is a second way to ask
 * it. What it must *not* mean is the users module growing permission logic — so
 * `UserController` is untouched, and this controller sits beside the service that
 * owns the four permission tables.
 *
 * **`PUT` rather than `PATCH`, and that is the interesting choice.** The body is
 * the *full intended matrix*, not a list of changes, so the verb is the one that
 * promises replacement and idempotence — and this endpoint keeps both promises
 * all the way down to the history: the same body twice leaves the same overrides
 * and writes no second batch of audit rows. A `PATCH` taking grants and
 * revocations would have required every client to hold a correct copy of the role
 * baseline in order to compose one, and the day a baseline changed, every open
 * tab would be diffing against a stale copy.
 *
 * **Every route here is permission-gated, as of Feature 035** — and this
 * controller is the most important one in the application to lock, because it is
 * the one that decides what everybody else may do. An ungated
 * `PUT /users/:id/permissions` is not one hole, it is every hole: a caller who
 * reaches it can grant themselves the rest. Three keys, not one, because the
 * three kinds of act are genuinely different:
 *
 * | Route | Key | Why that one |
 * | --- | --- | --- |
 * | `GET` (matrix), `GET /history` | `PERMISSIONS.VIEW` | reading what somebody else may do |
 * | `PUT` | `PERMISSIONS.EDIT` | "change an individual permission on somebody's matrix" |
 * | `POST /apply-preset`, `DELETE` | `PERMISSIONS.CONFIGURE` | "the two operations that replace a whole matrix at once" |
 *
 * The wording in the right-hand column is the seed's own description of each
 * key, and the split is the one Feature 029 already designed the catalog
 * around: `PERMISSIONS` has no `CREATE` and no `DELETE` precisely because the
 * only writes this screen performs are one matrix cell (`EDIT`) and the two bulk
 * replacements (`CONFIGURE`). This feature enforces the distinction the catalog
 * was already drawn to express rather than inventing one.
 *
 * Neither `EDIT` nor `CONFIGURE` is in any role baseline, which is also
 * deliberate and predates this feature: managing what other people may do is an
 * explicit grant made one account at a time, through the "Admin - Full Access"
 * preset or a per-user override. A super-admin holds both by resolution, so the
 * system can never be left with nobody able to administer it — including the
 * case where somebody locks themselves out of this very screen.
 *
 * What is enforced *underneath* the gate is unchanged: the one rule about the
 * resource rather than the caller — a super-admin's permissions cannot be
 * written, on any of the three, and that is a `409`.
 *
 * Every method is a one-line delegation on purpose, and `id` is taken as a plain
 * string: ids are cuids, so `ParseUUIDPipe` would reject valid ones.
 */
@ApiTags(API_TAG.Permissions)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors(HttpStatus.FORBIDDEN, HttpStatus.NOT_FOUND)
@Controller('users/:id/permissions')
export class UserPermissionController {
  constructor(private readonly userPermissions: UserPermissionService) {}

  /**
   * The user's matrix: every catalog permission with whether they hold it and
   * **why** — from their role, from an exception, or not at all.
   *
   * The `source` on each cell is what makes the screen usable: a tick alone
   * cannot tell a permission somebody was given from one their role grants, and
   * an untick cannot tell a permission that was taken away from one nobody ever
   * had.
   *
   * A super-admin target comes back fully granted and `readOnly: true`.
   */
  @ApiOperation({
    summary: 'Read a user’s permission matrix',
    description:
      'Every catalog permission with whether they hold it and **why** — from their role, from an exception, or not at all. The `source` on each cell is what makes the screen usable: a tick alone cannot tell a permission somebody was *given* from one their role grants, and an untick cannot tell one that was *taken away* from one nobody ever had. A super-admin target comes back fully granted and `readOnly: true`. Requires `PERMISSIONS.VIEW`.',
  })
  @ApiOkEnvelope(UserPermissionMatrixEntity)
  @Get()
  @RequirePermission('PERMISSIONS.VIEW')
  findMatrix(@Param('id') id: string): Promise<UserPermissionMatrixEntity> {
    return this.userPermissions.findMatrix(id);
  }

  /**
   * Replaces the user's permissions with the submitted set.
   *
   * The body lists every permission the user should hold; the service works out
   * where that departs from their role and stores only the difference. An
   * unknown key is a `400` naming it, a super-admin target is a `409`, and the
   * response is the matrix as it now stands — which is not always the matrix
   * that was asked for, because a submitted permission the role already grants
   * produces no exception at all.
   */
  @ApiOperation({
    summary: 'Replace a user’s permissions',
    description:
      '**The body is the full intended matrix, not a list of changes** — which is why it is a `PUT`: the same body twice leaves the same overrides and writes no second batch of audit rows. A `PATCH` of grants and revocations would have required every client to hold a correct copy of the role baseline to compose one. The service works out where the submitted set departs from the role and stores only the difference, so the response is not always the matrix that was asked for: a submitted permission the role already grants produces no exception at all. An unknown key is a `400` naming it; a super-admin target is a `409`. Requires `PERMISSIONS.EDIT`.',
  })
  @ApiOkEnvelope(UserPermissionMatrixEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT)
  @Put()
  @RequirePermission('PERMISSIONS.EDIT')
  replace(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUser,
    @Body() dto: SetUserPermissionsDto,
  ): Promise<UserPermissionMatrixEntity> {
    return this.userPermissions.replace(id, user, dto);
  }

  /**
   * Puts the user on a preset: their exceptions are replaced so their effective
   * set equals the preset's.
   *
   * A `POST` rather than a second `PUT`, because it is an *action* taken on the
   * matrix rather than a statement of what the matrix should be — the same
   * distinction that makes it write a `PRESET_APPLIED` summary row even when
   * nothing changes. An unknown preset key is a `404`.
   *
   * Answers 201; Nest applies it to `@Post` without a `@HttpCode`. The body is
   * the resulting matrix, so the screen renders what the preset actually did.
   */
  @ApiOperation({
    summary: 'Apply a preset to a user',
    description:
      'Replaces the user’s exceptions so their effective set equals the preset’s. A `POST` rather than a second `PUT`, because it is an *action* taken on the matrix rather than a statement of what the matrix should be — the same distinction that makes it write a `PRESET_APPLIED` summary row even when nothing changes. An unknown preset key is a `404`; a super-admin target is a `409`. The body is the resulting matrix, so the screen renders what the preset actually did. Requires `PERMISSIONS.CONFIGURE`.',
  })
  @ApiCreatedEnvelope(UserPermissionMatrixEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT)
  @Post('apply-preset')
  @RequirePermission('PERMISSIONS.CONFIGURE')
  applyPreset(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUser,
    @Body() dto: ApplyPresetDto,
  ): Promise<UserPermissionMatrixEntity> {
    return this.userPermissions.applyPreset(id, user, dto);
  }

  /**
   * Resets the user to their role: every exception is cleared.
   *
   * A `DELETE` on the collection of *exceptions*, which is what the sub-resource
   * actually stores — deleting a user's permissions cannot mean leaving them
   * with none, because a role always grants something. It is deliberately not
   * the same as `PUT { "permissionKeys": [] }`, which revokes everything the
   * role grants; the two are opposite ends of the same axis and both are worth
   * being able to say.
   *
   * Answers 200 with the resulting matrix rather than 204 — the call Feature 006
   * made so a client reads the same two fields whatever it called, and useful
   * here because the reset is exactly the case where the screen needs redrawing.
   */
  @ApiOperation({
    summary: 'Reset a user to their role',
    description:
      'Clears every exception. A `DELETE` on the collection of *exceptions*, which is what this sub-resource actually stores — deleting a user’s permissions cannot mean leaving them with none, because a role always grants something. Deliberately **not** the same as `PUT { "permissionKeys": [] }`, which revokes everything the role grants: the two are opposite ends of the same axis and both are worth being able to say. Answers `200` with the resulting matrix rather than `204`, because the reset is exactly the case where the screen needs redrawing. Requires `PERMISSIONS.CONFIGURE`.',
  })
  @ApiOkEnvelope(UserPermissionMatrixEntity)
  @ApiStandardErrors(HttpStatus.CONFLICT)
  @Delete()
  @RequirePermission('PERMISSIONS.CONFIGURE')
  resetToRole(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUser,
  ): Promise<UserPermissionMatrixEntity> {
    return this.userPermissions.resetToRole(id, user);
  }

  /**
   * Who changed this user's permissions, what moved, and when — newest first.
   *
   * Each line is a transition rather than a snapshot, and the two summary
   * actions (`PRESET_APPLIED`, `RESET_TO_ROLE`) carry no permission: they are
   * headings over the per-permission lines written in the same transaction, and
   * share their timestamp to the millisecond.
   */
  @ApiOperation({
    summary: 'Read a user’s permission history',
    description:
      'Who changed this user’s permissions, what moved, and when — newest first. Each line is a *transition* rather than a snapshot, and the two summary actions (`PRESET_APPLIED`, `RESET_TO_ROLE`) carry no permission: they are headings over the per-permission lines written in the same transaction, and share their timestamp to the millisecond. Requires `PERMISSIONS.VIEW`.',
  })
  @ApiOkPageEnvelope(PermissionAuditLogEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Get('history')
  @RequirePermission('PERMISSIONS.VIEW')
  findHistory(
    @Param('id') id: string,
    @Query() query: PermissionHistoryQueryDto,
  ): Promise<PaginatedResult<PermissionAuditLogEntity>> {
    return this.userPermissions.findHistory(id, query);
  }
}
