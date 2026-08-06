import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
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
 * **Nothing here is gated.** These routes should eventually be reachable only by
 * a caller holding `PERMISSIONS.EDIT`, and today they are reachable by anybody,
 * because `x-user-id` and `x-user-role` are claims rather than credentials until
 * authentication exists. Shipping a guard over them would be shipping the
 * appearance of a control. What *is* enforced is the one rule that is about the
 * resource rather than the caller: a super-admin's permissions cannot be written,
 * on any of the three, and that is a `409`.
 *
 * Every method is a one-line delegation on purpose, and `id` is taken as a plain
 * string: ids are cuids, so `ParseUUIDPipe` would reject valid ones.
 */
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
  @Get()
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
  @Put()
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
  @Post('apply-preset')
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
  @Delete()
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
  @Get('history')
  findHistory(
    @Param('id') id: string,
    @Query() query: PermissionHistoryQueryDto,
  ): Promise<PaginatedResult<PermissionAuditLogEntity>> {
    return this.userPermissions.findHistory(id, query);
  }
}
