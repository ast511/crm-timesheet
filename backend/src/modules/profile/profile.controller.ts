import { Body, Controller, Get, Patch } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
 * it is one field; the table on that class says where each excluded field is
 * changed instead.
 */
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
  @Patch('me')
  updateOwn(
    @CurrentUser() user: CurrentUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileEntity> {
    return this.profileService.updateOwn(user, dto);
  }
}
