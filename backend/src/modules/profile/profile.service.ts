import { ForbiddenException, Injectable } from '@nestjs/common';

import { ERROR_CODES } from '../../common/constants/error-codes.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { codedError } from '../../common/errors/coded-error';
import type { Prisma } from '../../generated/prisma/client';
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
   * Changes the few personal fields a person owns about themselves.
   *
   * **The body spans two tables, and that is what shapes this method.** `phone`
   * is a column of `employees`; `colorScheme` and `cornerRadius` are columns of
   * `users` (Feature 039). A caller sends one body and never has to know which,
   * so the split is made here.
   *
   * **The employment record is required only by the half that needs one.** An
   * account with no employee — a super-admin created to administer the system —
   * used to be refused outright, because the only editable field lived on
   * `employees` and there was genuinely nothing to write. That is no longer true:
   * such an account has preferences, and refusing to let it choose a theme would
   * be refusing a write to a row that does exist. So the refusal is now
   * conditional on the request actually naming `phone`, and it is still
   * `AUTH_NO_EMPLOYEE_RECORD` — the code Feature 033 created for exactly this
   * shape ("the route is about their own employment record and their account has
   * none") — rather than a second way of saying it.
   *
   * The refusal is raised **before** anything is written, so a body carrying both
   * a phone and a preference changes neither. The two updates are then a
   * transaction for the same reason: one request is one intention, and a run in
   * which the theme landed and the phone did not would leave the client's
   * success-or-failure answer describing only half of what happened.
   *
   * Each update is keyed on the caller's own session — `userId` for the account,
   * `employeeId` for the employment record — so there is no path by which this
   * writes another person's row, the same property {@link findOwn} has and for
   * the same reason.
   *
   * A body with no fields at all writes nothing at all and returns the profile
   * unchanged. That is deliberate rather than a `400`: `PATCH` with nothing to
   * change is not an error, and a form that submits an untouched field should not
   * fail.
   */
  async updateOwn(
    user: CurrentUser,
    dto: UpdateProfileDto,
  ): Promise<ProfileEntity> {
    const { employeeId } = user;

    // `undefined` means "absent from the body" and is what distinguishes leaving
    // a field alone from clearing it — `phone: null` is a request to erase the
    // number, and has to reach the UPDATE. The two preferences have no null at
    // all, so for them absence is the only thing this can be.
    const changesPhone = dto.phone !== undefined;
    const changesPreferences =
      dto.colorScheme !== undefined || dto.cornerRadius !== undefined;

    if (changesPhone && employeeId === null) {
      throw new ForbiddenException(
        codedError(
          ERROR_CODES.AUTH_NO_EMPLOYEE_RECORD,
          'This account has no employment record, so there is no personal information to edit',
        ),
      );
    }

    // Every writable field of this endpoint is named here, one line each: there
    // is no spread of the DTO, so widening what a person may change about
    // themselves takes an edit in two places that a reviewer will see.
    const writes: Prisma.PrismaPromise<{ id: string }>[] = [];

    if (changesPreferences) {
      writes.push(
        this.prisma.user.update({
          where: { id: user.userId },
          data: {
            colorScheme: dto.colorScheme,
            cornerRadius: dto.cornerRadius,
          },
          select: { id: true },
        }),
      );
    }

    // `employeeId` is non-null whenever `changesPhone` is — the refusal above is
    // what makes that true. It is restated as a condition rather than asserted
    // with a cast, so the compiler keeps checking the thing the comment claims.
    if (changesPhone && employeeId !== null) {
      writes.push(
        this.prisma.employee.update({
          where: { id: employeeId },
          data: { phone: dto.phone },
          select: { id: true },
        }),
      );
    }

    // A `PATCH` that named nothing writes nothing — not even an empty
    // transaction, and not the `updated_at` bump an all-`undefined` UPDATE would
    // otherwise have made.
    if (writes.length > 0) {
      await this.prisma.$transaction(writes);
    }

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
