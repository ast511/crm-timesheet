import { ForbiddenException, Injectable } from '@nestjs/common';

import { ERROR_CODES } from '../../common/constants/error-codes.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { codedError } from '../../common/errors/coded-error';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  PROFILE_SELECT,
  ProfileEntity,
  ProfileRow,
  toProfileEntity,
} from './entities/profile.entity';

/**
 * A person's own account and employment record, read and — very narrowly —
 * written.
 *
 * **Every method here operates on the caller and only the caller.** There is no
 * `findOne(id)` and no id parameter anywhere in this service: the account is
 * taken from `@CurrentUser()`, which the JWT guard filled in from a verified
 * token. That is not an ownership *check* — it is the absence of anything to
 * check, because there is no way to name another person's profile through these
 * routes at all. A check can be forgotten; a missing parameter cannot.
 *
 * The alternative shape, `GET /profile/:id` with `if (id !== user.userId) throw`,
 * was rejected for exactly that reason. It is the design in which somebody
 * eventually adds a second method and forgets the guard, and in which a `403`
 * confirms which ids exist.
 *
 * Somebody else's profile is `GET /employees/:id` (HR data, HR's endpoint) and
 * `GET /users/:id` (the account, ADMIN/SUPERADMIN only). Both of those are
 * other people's business by design; this is the person's own.
 */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The caller's account and, when they have one, their employment record.
   *
   * Read fresh rather than assembled from the `CurrentUser` the guard already
   * resolved, for the reason `GET /auth/me` gives: this endpoint's whole purpose
   * is to be the current answer, and a projection of what was read microseconds
   * earlier would be the same four fields by a longer route. What a profile
   * screen actually needs — the person's name, department, position and hire
   * date — is not in `CurrentUser` at all, and should not be: that seam carries
   * what the application needs to make decisions, not what a page renders.
   *
   * One query with a join rather than two, since the two halves are one screen.
   */
  async findOwn(user: CurrentUser): Promise<ProfileEntity> {
    const row = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: PROFILE_SELECT,
    });

    // Unreachable in practice: the guard resolved this account from the database
    // on this very request, so it existed milliseconds ago. It is handled rather
    // than asserted because the alternative is a `null` dereference rendered as
    // a `500`, and the honest reading of "your account no longer exists" is that
    // the session is over.
    if (row === null) {
      throw sessionAccountMissing();
    }

    return toProfileEntity(row as ProfileRow);
  }

  /**
   * Changes the one personal field a person owns about themselves.
   *
   * **Requires an employment record**, and the refusal is the interesting case:
   * an account with no employee — a super-admin created to administer the system
   * — has nothing this endpoint can write, because the only editable field lives
   * on `employees`. It answers `AUTH_NO_EMPLOYEE_RECORD`, the code Feature 033
   * created for precisely this shape of route ("the route is about their own
   * employment record and their account has none"), rather than inventing a
   * second way to say it.
   *
   * The update is keyed on `employeeId` from the caller's own session, so there
   * is no path by which this writes another person's row — the same property
   * {@link findOwn} has, for the same reason.
   *
   * A body with no fields at all is a no-op that returns the profile unchanged.
   * That is deliberate rather than a `400`: `PATCH` with nothing to change is not
   * an error, and a form that submits an untouched field should not fail.
   */
  async updateOwn(
    user: CurrentUser,
    dto: UpdateProfileDto,
  ): Promise<ProfileEntity> {
    if (user.employeeId === null) {
      throw new ForbiddenException(
        codedError(
          ERROR_CODES.AUTH_NO_EMPLOYEE_RECORD,
          'This account has no employment record, so there is no personal information to edit',
        ),
      );
    }

    await this.prisma.employee.update({
      where: { id: user.employeeId },
      // `undefined` is omitted from the UPDATE by Prisma, so an absent field is
      // left alone while an explicit `null` clears the column. Every writable
      // field of this endpoint is named here, one line each: there is no spread
      // of the DTO, so widening what a person may change about themselves takes
      // an edit in two places that a reviewer will see.
      data: { phone: dto.phone },
      select: { id: true },
    });

    return this.findOwn(user);
  }
}

/**
 * The refusal for a session whose account has disappeared.
 *
 * A `403` carrying the standard unauthenticated code, because the session is
 * genuinely over and the client's correct response is the login screen. It is a
 * function so the two halves — status and code — are decided once, even though
 * only one call site can reach it today.
 */
function sessionAccountMissing(): ForbiddenException {
  return new ForbiddenException(
    codedError(
      ERROR_CODES.AUTH_UNAUTHENTICATED,
      'The account behind this session no longer exists',
    ),
  );
}
