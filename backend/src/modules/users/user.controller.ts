import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import {
  ApiCreatedEnvelope,
  ApiOkEnvelope,
  ApiOkNullEnvelope,
  ApiOkPageEnvelope,
} from '../../common/swagger/api-envelope-response.decorator';
import { ApiStandardErrors } from '../../common/swagger/api-standard-errors.decorator';
import { API_TAG } from '../../config/swagger-tags';
import { BEARER_AUTH_NAME } from '../../config/swagger.setup';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserEntity } from './entities/user.entity';
import { assertAccountAdministrator } from './user.rules';
import { UserService } from './user.service';

/**
 * `/api/v1/users` — accounts, and everything about who may sign in.
 *
 * The prefix and the version come from `configureApp`, so only the resource
 * segment is declared here. Every method is a one-line delegation apart from the
 * access check: validation is the DTOs' job, the success envelope is the global
 * interceptor's, error rendering is the global filter's, and every rule is the
 * service's.
 *
 * ## Access: `ADMIN` and `SUPERADMIN` only — never HR
 *
 * Feature 032 put a valid access token in front of these routes and Feature 036
 * decides *which* accounts may use them. Every route here calls
 * {@link assertAccountAdministrator}, including the two reads: an account list is
 * a list of everybody who can sign in and what authority each one holds, which is
 * not something an ordinary employee — or an HR administrator — has business
 * enumerating.
 *
 * **It is a role check rather than a `@RequirePermission()` gate**, which is a
 * deliberate departure from how Feature 035 gated reports and permissions. The
 * argument is in `user.rules.ts` and it is short: whoever can set a role can set
 * their own, so a *configurable* permission to administer accounts would be a
 * configurable way to grant oneself everything else. This boundary must not have
 * a checkbox.
 *
 * The check is called in each handler rather than applied as a guard, because
 * that is what keeps it in the same file as the routes it protects — and because
 * the one other place it is needed, the account opt-in on `POST /employees`,
 * depends on the request *body* and could not have been a route-level guard at
 * all.
 *
 * ## The three lifecycle routes, and why they are not a PATCH
 *
 * `resend-activation`, `activate` and `deactivate` are `POST`s on sub-resources
 * rather than fields on `PATCH /users/:id`. They are transitions with
 * preconditions and side effects — deactivating revokes the account's live
 * sessions, resending invalidates the previous link — and a writable `status`
 * field would invite `PATCH { "status": "ACTIVE" }` on an account that has no
 * password to sign in with. The same call `TimesheetController` makes about its
 * own state machine.
 *
 * `DELETE /users/:id` is untouched by Feature 036 and still refuses an account an
 * employee is linked to. Deleting is for an account created by mistake;
 * `deactivate` is what happens to a person who has left, and neither was
 * repurposed into the other.
 *
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 *
 * Every route here documents a `403`, and that is not boilerplate: it is the
 * account-administrator boundary above, and it is the one refusal in this API
 * that no permission can be granted to lift. The code is
 * `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED`; a frontend that offered a "request
 * access" link for it would be promising something no screen here can do.
 *
 * **No response on this controller carries `passwordHash`.** `UserEntity` has
 * no such field for a mapper to copy and `USER_PUBLIC_SELECT` never reads the
 * column, so the documented schema and the query agree by construction rather
 * than by review — see `user.entity.ts`.
 */
@ApiTags(API_TAG.Users)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors(HttpStatus.FORBIDDEN)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({
    summary: 'List accounts',
    description:
      'Paginated, filterable and sortable. An account list is a list of everybody who can sign in and what authority each holds, which is why even the reads are ADMIN/SUPERADMIN only.',
  })
  @ApiOkPageEnvelope(UserEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Get()
  findAll(
    @CurrentUser() user: CurrentUser,
    @Query() query: UserQueryDto,
  ): Promise<PaginatedResult<UserEntity>> {
    assertAccountAdministrator(user);

    return this.userService.findAll(query);
  }

  @ApiOperation({ summary: 'Read one account' })
  @ApiOkEnvelope(UserEntity)
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
  @Get(':id')
  findOne(
    @CurrentUser() user: CurrentUser,
    @Param('id') id: string,
  ): Promise<UserEntity> {
    assertAccountAdministrator(user);

    return this.userService.findOne(id);
  }

  /**
   * Creates an account and emails its owner an invitation link.
   *
   * The account is `PENDING_ACTIVATION` and unusable when this answers — no
   * password exists for it anywhere, including for the administrator who created
   * it. See `UserService.create`.
   *
   * Answers 201; Nest applies it to `@Post` without a `@HttpCode`. The body is
   * the account, which carries no token and no hash.
   */
  @ApiOperation({
    summary: 'Create an account and email its invitation',
    description:
      'The account is `PENDING_ACTIVATION` and unusable when this answers: no password exists for it anywhere, including for the administrator who created it. The body accepts no `password` and the response carries no token and no hash — the activation secret travels only by email.',
  })
  @ApiCreatedEnvelope(UserEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT)
  @Post()
  create(
    @CurrentUser() user: CurrentUser,
    @Body() dto: CreateUserDto,
  ): Promise<UserEntity> {
    assertAccountAdministrator(user);

    return this.userService.create(dto);
  }

  @ApiOperation({
    summary: 'Update an account',
    description:
      'A partial update of the address, the username and the role. `status` is deliberately not writable here — the three transitions below own it.',
  })
  @ApiOkEnvelope(UserEntity)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserEntity> {
    assertAccountAdministrator(user);

    return this.userService.update(id, dto);
  }

  /**
   * `POST /users/:id/resend-activation` — a fresh invitation link.
   *
   * For an expired or lost one. Only `PENDING_ACTIVATION` accounts qualify; an
   * account whose owner has already activated gets a `409` naming its state,
   * because the thing that person needs is a password reset, which is theirs to
   * request.
   *
   * Answers 200 with `{ "success": true, "data": null }`. There is nothing to
   * return: the token is in an email and must not be in a response body, where a
   * browser's history, a proxy log or a screenshot would keep it.
   */
  @ApiOperation({
    summary: 'Re-send an invitation link',
    description:
      'For an expired or lost one, and only for a `PENDING_ACTIVATION` account — an account whose owner has already activated gets a `409` carrying `ACCOUNT_NOT_PENDING_ACTIVATION` and its actual status in `params`, because what that person needs is a password reset, which is theirs to request. Issuing a new link invalidates the previous one. Answers `data: null`: the token is in an email and must not be in a response body, where a browser history, a proxy log or a screenshot would keep it.',
  })
  @ApiOkNullEnvelope()
  @ApiStandardErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  @Post(':id/resend-activation')
  @HttpCode(HttpStatus.OK)
  resendActivation(
    @CurrentUser() user: CurrentUser,
    @Param('id') id: string,
  ): Promise<void> {
    assertAccountAdministrator(user);

    return this.userService.resendActivation(id);
  }

  /**
   * `POST /users/:id/activate` — re-enables a disabled account.
   *
   * **Administrative enable, not onboarding.** It moves `DISABLED → ACTIVE` and
   * refuses `PENDING_ACTIVATION` with a `409`, because an account that has never
   * had a password cannot be made usable by flipping a state — the only thing
   * that activates one of those is its owner following an invitation link.
   */
  @ApiOperation({
    summary: 'Re-enable a disabled account',
    description:
      '**Administrative enable, not onboarding.** Moves `DISABLED → ACTIVE` and refuses `PENDING_ACTIVATION` with a `409`: an account that has never had a password cannot be made usable by flipping a state, and the only thing that activates one of those is its owner following an invitation link.',
  })
  @ApiOkEnvelope(UserEntity)
  @ApiStandardErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  activate(
    @CurrentUser() user: CurrentUser,
    @Param('id') id: string,
  ): Promise<UserEntity> {
    assertAccountAdministrator(user);

    return this.userService.activate(id);
  }

  /**
   * `POST /users/:id/deactivate` — disables an account and ends its sessions.
   *
   * The lifecycle action for somebody who has left or whose access is being
   * suspended. The password and every record pointing at the account survive, so
   * it can be turned back on; what does not survive is the account's live refresh
   * tokens, which is what makes the disabling take effect within one access
   * token's lifetime rather than within a week.
   */
  @ApiOperation({
    summary: 'Disable an account and end its sessions',
    description:
      'The lifecycle action for somebody who has left or whose access is being suspended. The password and every record pointing at the account survive, so it can be turned back on; what does not survive is the account’s live refresh tokens, which is what makes the disabling take effect within one access token’s lifetime rather than within a week.',
  })
  @ApiOkEnvelope(UserEntity)
  @ApiStandardErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(
    @CurrentUser() user: CurrentUser,
    @Param('id') id: string,
  ): Promise<UserEntity> {
    assertAccountAdministrator(user);

    return this.userService.deactivate(id);
  }

  /**
   * Answers 200 with `{ "success": true, "data": null }` rather than 204.
   *
   * A 204 would have to carry an empty body, making this the one endpoint whose
   * response is not the envelope — Feature 006 chose the explicit `data: null`
   * so a client reads the same two fields whatever it called.
   */
  @ApiOperation({
    summary: 'Delete an account',
    description:
      'For an account created by mistake. Refused with a `409` while an employee is linked to it — the lifecycle action for somebody who has left is `deactivate`, and neither was repurposed into the other.',
  })
  @ApiOkNullEnvelope()
  @ApiStandardErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  @Delete(':id')
  remove(
    @CurrentUser() user: CurrentUser,
    @Param('id') id: string,
  ): Promise<void> {
    assertAccountAdministrator(user);

    return this.userService.remove(id);
  }
}
