import { Controller, Get, Query } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
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
 * **No route here enforces anything.** `me/effective` reports a permission set;
 * it blocks nothing, and nothing else in this application consults it. That was
 * written when a guard could only have checked a forgeable identity — half an
 * access check, which reads as protection while providing none. Feature 032
 * fixed the identity; every route below now requires a valid access token, and
 * *which* caller may do *what* is the authorization enforcement feature. See
 * the module documentation for the guard it will bring.
 *
 * The two static segments — `presets` and `me/effective` — cannot collide with
 * anything, because this controller deliberately has **no `GET /:id`**: a
 * permission is addressed by its `key` wherever it is used, and a second way to
 * name one row would be a second thing to keep in step.
 *
 * Every method is a one-line delegation on purpose.
 */
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
  @Get()
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
  @Get('presets')
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
   */
  @Get('me/effective')
  findMyEffective(
    @CurrentUser() user: CurrentUser,
  ): Promise<EffectivePermissionsEntity> {
    return this.permissions.findEffectiveForCaller(user);
  }
}
