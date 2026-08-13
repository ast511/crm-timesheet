import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import {
  ApiOkEnvelope,
  ApiOkPageEnvelope,
} from '../../common/swagger/api-envelope-response.decorator';
import { ApiStandardErrors } from '../../common/swagger/api-standard-errors.decorator';
import { API_TAG } from '../../config/swagger-tags';
import { BEARER_AUTH_NAME } from '../../config/swagger.setup';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { PermissionQueryDto } from './dto/permission-query.dto';
import { PresetQueryDto } from './dto/preset-query.dto';
import { PermissionPresetEntity } from './entities/permission-preset.entity';
import { PermissionResourceGroupEntity } from './entities/permission.entity';
import { EffectivePermissionsEntity } from './entities/user-permission-matrix.entity';
import { PermissionService } from './permission.service';

/**
 * `/api/v1/permissions` — the permission vocabulary, the presets built from it,
 * and what the caller may currently do. The prefix and the version come from
 * `configureApp`, so only the resource segment is declared here.
 *
 * **Every route on this controller is a `GET`.** There is no `POST /permissions`
 * and no `POST /permissions/presets`, and their absence is the feature's
 * position rather than an omission: both tables are seeded vocabulary. A
 * permission row is meaningless unless something in the application checks it, so
 * creating one at runtime would put a cell on the matrix screen that nothing
 * anywhere reads; a preset is a recommendation this product makes. Both arrive
 * with a migration and a seed entry, which is the same call Feature 003 recorded
 * for how roles and permissions would be added.
 *
 * **The two administrative reads are gated as of Feature 035**, with
 * `PERMISSIONS.VIEW`: reading the catalog and the presets is how the permissions
 * screen is drawn, and a caller who may not see that screen has no business
 * enumerating what can be granted. `PermissionsGuard` refuses with a `403` and
 * `AUTHORIZATION_PERMISSION_DENIED`.
 *
 * **`me/effective` is deliberately not gated, and that is the interesting
 * one.** It is the endpoint every client calls to find out which buttons to
 * draw, for *itself*, and gating it on `PERMISSIONS.VIEW` would mean that only
 * an administrator could discover their own permissions — every ordinary
 * employee would get a `403` from the call whose entire purpose is to tell them
 * what they may do, and the frontend would have to treat that `403` as "you have
 * nothing", which is exactly wrong. Reading your own effective set is not a
 * privileged act: it returns keys the caller already holds and reveals nothing
 * about anybody else, in the same way that reading your own inbox is denied to
 * nobody. Somebody else's set is `GET /users/:id/permissions`, and that one *is*
 * gated.
 *
 * The two static segments — `presets` and `me/effective` — cannot collide with
 * anything, because this controller deliberately has **no `GET /:id`**: a
 * permission is addressed by its `key` wherever it is used, and a second way to
 * name one row would be a second thing to keep in step.
 *
 * Every method is a one-line delegation on purpose.
 */
@ApiTags(API_TAG.Permissions)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors()
@Controller('permissions')
export class PermissionController {
  constructor(private readonly permissions: PermissionService) {}

  /**
   * The catalog, blocked by resource so the matrix renders without a
   * client-side reduce.
   *
   * `page` and `limit` select **permissions**, not groups, so `total` describes
   * the catalog. Fifty-five rows against a cap of 100 means `?limit=100` returns
   * the whole matrix in one request, which is what the screen asks for.
   */
  @ApiOperation({
    summary: 'Read the permission catalog',
    description:
      'Blocked by resource so the matrix renders without a client-side reduce. `page` and `limit` select **permissions**, not groups, so `total` describes the catalog: fifty-five rows against a cap of 100 means `?limit=100` returns the whole matrix in one request. Requires `PERMISSIONS.VIEW`. There is deliberately no `POST` — the catalog is seeded vocabulary, and a permission row nothing checks would be a cell on a screen that means nothing.',
  })
  @ApiOkPageEnvelope(PermissionResourceGroupEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST, HttpStatus.FORBIDDEN)
  @Get()
  @RequirePermission('PERMISSIONS.VIEW')
  findAll(
    @Query() query: PermissionQueryDto,
  ): Promise<PaginatedResult<PermissionResourceGroupEntity>> {
    return this.permissions.findAll(query);
  }

  /**
   * The quick-apply cards, each with the number of permissions it hands out and
   * the role it is grouped under.
   *
   * `?targetRole=` narrows what is shown and not what may be used: a preset may
   * be applied to any account that is not a super-admin.
   */
  @ApiOperation({
    summary: 'Read the permission presets',
    description:
      'The quick-apply cards, each with the number of permissions it hands out and the role it is grouped under. `?targetRole=` narrows what is *shown* and not what may be *used*: a preset may be applied to any account that is not a super-admin. Requires `PERMISSIONS.VIEW`.',
  })
  @ApiOkPageEnvelope(PermissionPresetEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST, HttpStatus.FORBIDDEN)
  @Get('presets')
  @RequirePermission('PERMISSIONS.VIEW')
  findPresets(
    @Query() query: PresetQueryDto,
  ): Promise<PaginatedResult<PermissionPresetEntity>> {
    return this.permissions.findPresets(query);
  }

  /**
   * What the caller may do, as a flat list of keys — the endpoint a frontend
   * gates its UI on.
   *
   * `/me/effective` rather than `/effective`, so the scope is in the URL and
   * there is never a second way to ask the same question: "what may *somebody
   * else* do" is `GET /users/:id/permissions`, and it answers with the matrix
   * because that is an administrator's question rather than a renderer's.
   *
   * A super-admin caller gets every key and `readOnly: true`. The role comes
   * from `@CurrentUser()` — a claim in a header when this was written, an
   * account read from `users` since Feature 032, through the same parameter.
   *
   * **Not permission-gated**, and it must not become so: this is how a client
   * learns what to hide, and it answers about the caller alone. See the
   * controller documentation. It is soft gating still — a client that skipped
   * this call and drew every button now meets a real `403` on the request rather
   * than nothing at all, which is what Feature 035 changed about it.
   */
  @ApiOperation({
    summary: 'Read my own effective permissions',
    description:
      "**The endpoint a frontend gates its UI on** — a flat array of keys a client turns into a `Set` once and asks `has('TIMESHEET.CREATE')` of thereafter. **Deliberately not permission-gated, and it must not become so**: gating it would mean only an administrator could discover their own permissions, and every ordinary employee would get a `403` from the call whose entire purpose is to tell them what they may do. It answers about the caller alone and reveals nothing about anybody else; somebody else’s set is `GET /users/:id/permissions`, and that one *is* gated. This is soft gating — a client that skips the call and draws every button meets a real `403` on the request.",
  })
  @ApiOkEnvelope(EffectivePermissionsEntity)
  @Get('me/effective')
  findMyEffective(
    @CurrentUser() user: CurrentUser,
  ): Promise<EffectivePermissionsEntity> {
    return this.permissions.findEffectiveForCaller(user);
  }
}
