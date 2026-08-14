import { Body, Controller, Get, HttpStatus, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiOkEnvelope } from '../../common/swagger/api-envelope-response.decorator';
import { ApiStandardErrors } from '../../common/swagger/api-standard-errors.decorator';
import { API_TAG } from '../../config/swagger-tags';
import { BEARER_AUTH_NAME } from '../../config/swagger.setup';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileEntity } from './entities/profile.entity';
import { ProfileService } from './profile.service';

/**
 * `/api/v1/profile` — the signed-in person's own account and employment record.
 *
 * The prefix and the version come from `configureApp`, so only the resource
 * segment is declared here. Every method is a one-line delegation on purpose.
 *
 * ## `/me`, and why there is no `/:id`
 *
 * Both routes are `me`, and the segment is not decoration: it is the scope, in
 * the URL, which is the rule Feature 015 settled for this project — "a scope
 * belongs in the URL rather than in a filter, and there is no second way to ask
 * the same question". Here it does something stronger than tidiness. **There is
 * no id parameter to get wrong.** A `GET /profile/:id` guarded by
 * `if (id !== user.userId) throw` is the design in which somebody adds a second
 * route next year and forgets the guard, and in which the `403` itself confirms
 * which ids are real. A route that cannot name another person needs no ownership
 * check, and this one has none because there is nothing to check.
 *
 * Somebody else's details are deliberately elsewhere and behind their own rules:
 * `GET /employees/:id` for HR data, `GET /users/:id` for the account —
 * ADMIN/SUPERADMIN only.
 *
 * ## No permission gate, and that is the point
 *
 * These are the two routes in the application every authenticated caller may
 * use, whatever their role and whatever their permission matrix says. Gating
 * them would mean an ordinary employee could not read their own name — and the
 * thing being read or written is theirs, so there is no authority to check
 * beyond "you are signed in", which `JwtAuthGuard` already established.
 *
 * ## What is not here
 *
 * **Password changes.** They go through `POST /auth/change-password`, which asks
 * for the current password first. A password field on this endpoint would be a
 * credential change authenticated by nothing but an open session, which is the
 * one thing an unattended laptop must not be able to do.
 *
 * **Everything an administrator owns.** `UpdateProfileDto` is the whitelist and
 * it is three fields; the table on that class says where each excluded field is
 * changed instead.
 *
 * ## The UI preferences, and where a frontend reads them
 *
 * Feature 039 put two personalisation columns on `users` — `colorScheme` and
 * `cornerRadius` — and **this endpoint is the only place the API sends or
 * accepts them.** They are on `GET /profile/me` and in the `PATCH` whitelist, on
 * a route that is already scoped to one person and already the thing a profile
 * screen calls.
 *
 * They were deliberately *not* added to `GET /auth/me` or the login response,
 * although those are the other candidates for session hydration. The query
 * behind them, `AUTHENTICATED_USER_SELECT`, runs on **every authenticated
 * request** — `JwtAuthGuard` resolves the caller from the database each time —
 * so a column added there is a column read on every call in the application, and
 * these two decide nothing: no guard branches on a colour. That seam carries what
 * the application needs to make decisions, which is the same sentence `AuthService`
 * already uses to explain why `email` is not in `CurrentUser`.
 *
 * So the contract for a frontend is one sentence: **call `GET /profile/me` on
 * load and apply `account.colorScheme` and `account.cornerRadius` from it**, and
 * write them back with `PATCH /profile/me`. That is a call a profile-aware client
 * makes anyway — it is where the person's name, department and position come from
 * — so the preferences cost no extra request. Light and dark are not among them
 * and never will be: the frontend keeps that locally, following the system
 * setting. See `UpdateProfileDto` and [UiColorScheme] in `schema.prisma`.
 */
@ApiTags(API_TAG.Profile)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors()
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  /**
   * The caller's account plus their employment record, or `employee: null` when
   * the account has none.
   *
   * Never returns the password hash or any activation or reset token — see
   * `ProfileEntity`, where the `select` that guarantees it lives.
   */
  @ApiOperation({
    summary: 'Read my own profile',
    description:
      'The caller’s account plus their employment record, or `employee: null` when the account has none. **There is no `/profile/:id`** — a route that cannot name another person needs no ownership check, and this one has none because there is nothing to check. Never returns the password hash or any activation or reset token; the `select` that guarantees it is on `ProfileEntity`. This and the `PATCH` below are the two routes every authenticated caller may use, whatever their role.\n\n**This is where a frontend reads the UI preferences.** `account.colorScheme` and `account.cornerRadius` are on this payload and on no other — `GET /auth/me` deliberately does not carry them, because the query behind it runs on every authenticated request and nothing authorises on a colour. Call this on load and apply both. Light/dark is not among them: the frontend keeps that locally, following the system setting.',
  })
  @ApiOkEnvelope(ProfileEntity)
  @Get('me')
  findOwn(@CurrentUser() user: CurrentUser): Promise<ProfileEntity> {
    return this.profileService.findOwn(user);
  }

  /**
   * Updates the personal fields a person owns about themselves.
   *
   * The body is whitelisted by `UpdateProfileDto` and the global pipe runs with
   * `forbidNonWhitelisted`, so `role`, `email`, `positionId` or `employeeCode`
   * in the payload is a `400` naming the offending property rather than a value
   * quietly dropped. That is what makes "a user cannot smuggle a promotion into
   * their profile update" a property of the type rather than of a filter
   * somebody has to maintain.
   *
   * Answers the whole profile rather than the employee record, so a client
   * re-renders the screen from one response.
   */
  @ApiOperation({
    summary: 'Update my own profile',
    description:
      'The body is whitelisted and the global pipe runs with `forbidNonWhitelisted`, so `role`, `email`, `positionId` or `employeeCode` in the payload is a `400` naming the offending property rather than a value quietly dropped — which is what makes "a user cannot smuggle a promotion into their profile update" a property of the type. **Password changes are not here**: they go through `POST /auth/change-password`, which asks for the current password first. Answers the whole profile, so a client re-renders the screen from one response.\n\nThree fields: `phone`, `colorScheme` and `cornerRadius`. They span two tables — the phone is on `employees`, the two preferences on `users` — which is invisible from the wire and has one observable consequence: an account with **no employment record** may set its preferences and gets `403 AUTH_NO_EMPLOYEE_RECORD` for a phone. The refusal is raised before anything is written and the two updates are one transaction, so a rejected request changes nothing at all. An unknown enum value is a `400 VALIDATION_ERROR` naming the property.',
  })
  @ApiOkEnvelope(ProfileEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Patch('me')
  updateOwn(
    @CurrentUser() user: CurrentUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileEntity> {
    return this.profileService.updateOwn(user, dto);
  }
}
