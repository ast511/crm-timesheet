import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { SortOrder } from '../../common/enums/sort-order.enum';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import { hashPassword } from '../../common/password/password.hasher';
import {
  buildPaginatedResult,
  toSkipTake,
} from '../../common/utils/pagination.util';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import {
  USER_PUBLIC_SELECT,
  UserEntity,
  toUserEntity,
} from './entities/user.entity';
import { UserSortField } from './user.constants';

/**
 * Makes PostgreSQL fold the case of both operands, so `ana` finds `ANA`.
 * Extracted because getting it wrong on one of the comparisons below would
 * produce a search or a duplicate check that quietly behaves differently from
 * the others.
 */
const CASE_INSENSITIVE = { mode: 'insensitive' } as const;

/** The unique fields an account can collide on. */
interface UniqueUserFields {
  readonly email?: string;
  readonly username?: string | null;
}

/**
 * Every rule about users lives here; the controller only routes.
 *
 * Two concerns are specific to this module and shape most of what follows:
 *
 * 1. **The password never survives this class.** It arrives as plain text,
 *    `hashPassword` turns it into a bcrypt hash, and the hash is written. No
 *    method returns it, no method reads it back — every Prisma call uses
 *    `USER_PUBLIC_SELECT`, so `passwordHash` is not even transferred out of
 *    PostgreSQL.
 * 2. **Deleting an account is not deleting a person.** `Employee.userId` is
 *    required, so a user with an employee is load-bearing; `remove` refuses
 *    rather than cascading.
 */
@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of users, narrowed by `search`, `role` and `isActive`, ordered by
   * `sortBy`.
   *
   * The rows and the total are read in a single `$transaction` so both see the
   * same snapshot: run separately, a concurrent insert between them would
   * produce a `total` that does not describe the page just returned.
   */
  async findAll(query: UserQueryDto): Promise<PaginatedResult<UserEntity>> {
    const where = buildWhere(query);

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        select: USER_PUBLIC_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPaginatedResult(users.map(toUserEntity), total, query);
  }

  async findOne(id: string): Promise<UserEntity> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });

    if (user === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    return toUserEntity(user);
  }

  /**
   * Creates an account from a plain-text password.
   *
   * Uniqueness is checked *before* hashing: bcrypt at cost factor 12 costs a
   * few hundred milliseconds of main-thread time, and there is no reason to
   * spend it on a request that ends in a `409`.
   */
  async create(dto: CreateUserDto): Promise<UserEntity> {
    await this.assertEmailAndUsernameAreFree(dto);

    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash: await hashPassword(dto.password),
        role: dto.role,
        isActive: dto.isActive,
      },
      select: USER_PUBLIC_SELECT,
    });

    return toUserEntity(created);
  }

  /**
   * Applies a partial update.
   *
   * Existence is checked before uniqueness so that patching a missing id
   * reports the missing id, rather than a conflict with whichever account
   * happens to own the submitted username.
   *
   * Only `username` is checked for conflicts, because `email` cannot be patched
   * — see `UpdateUserDto` for why it is not an editable field.
   */
  async update(id: string, dto: UpdateUserDto): Promise<UserEntity> {
    await this.assertExists(id);
    await this.assertEmailAndUsernameAreFree({ username: dto.username }, id);

    const updated = await this.prisma.user.update({
      where: { id },
      // `undefined` is omitted from the UPDATE by Prisma, so an absent field is
      // left alone while an explicit `null` username clears the column.
      data: {
        username: dto.username,
        passwordHash:
          dto.password === undefined
            ? undefined
            : await hashPassword(dto.password),
        role: dto.role,
        isActive: dto.isActive,
      },
      select: USER_PUBLIC_SELECT,
    });

    return toUserEntity(updated);
  }

  /**
   * Hard-deletes an account nothing depends on.
   *
   * The employee is read rather than cascaded: `Employee.userId` is a required
   * relation, so cascading would mean deleting the person's employment record —
   * their hire date, their department, their project history — to remove a
   * login. The `409` asks the caller to deactivate the account instead, or to
   * remove the employee first, which is a decision only a human should make.
   *
   * Existence and the employee link are read in one query, so the common case
   * is a single round trip and a `404` and a `409` cannot be decided from two
   * different snapshots.
   */
  async remove(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { employee: { select: { id: true } } },
    });

    if (user === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    if (user.employee !== null) {
      throw new ConflictException(
        `User ${id} cannot be deleted while employee ${user.employee.id} is linked to it`,
      );
    }

    await this.prisma.user.delete({ where: { id } });
  }

  /**
   * Reports a missing account.
   *
   * Selects `id` alone: the caller only needs to know the row is there, and
   * reading the whole record would pull `passwordHash` into the process for no
   * reason.
   */
  private async assertExists(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (user === null) {
      throw new NotFoundException(notFoundMessage(id));
    }
  }

  /**
   * Rejects an email or a username already taken by another account.
   *
   * Both fields are checked in one query, and both conflicts are reported at
   * once — as an array, the same shape the `ValidationPipe` produces — so a
   * form can mark each offending input instead of discovering the second
   * problem only after fixing the first.
   *
   * `username: null` is skipped rather than searched for. The column is
   * nullable, PostgreSQL's unique index permits any number of `NULL`s, and
   * querying `equals: null` would match every account without a username and
   * report a conflict that does not exist.
   *
   * The comparison is case-insensitive because `AnaP` and `anap` are the same
   * handle to a human, while PostgreSQL's unique index sees two rows. That
   * index still backs this check for the exact-case race between the read and
   * the write; a case-variant race would slip past both and needs a citext
   * column or a functional index to close — a schema change, out of scope here.
   * For `email` the gap is already closed in practice, since the DTO
   * lower-cases before the check.
   *
   * `excludeId` is the account being updated, which must not conflict with
   * itself.
   */
  private async assertEmailAndUsernameAreFree(
    { email, username }: UniqueUserFields,
    excludeId?: string,
  ): Promise<void> {
    const candidates: Prisma.UserWhereInput[] = [];

    if (email !== undefined) {
      candidates.push({ email: { equals: email, ...CASE_INSENSITIVE } });
    }

    if (username !== undefined && username !== null) {
      candidates.push({ username: { equals: username, ...CASE_INSENSITIVE } });
    }

    // A patch touching neither field has nothing to collide with.
    if (candidates.length === 0) {
      return;
    }

    const conflicts = await this.prisma.user.findMany({
      where: {
        OR: candidates,
        ...(excludeId === undefined ? {} : { NOT: { id: excludeId } }),
      },
      select: { email: true, username: true },
    });

    if (conflicts.length === 0) {
      return;
    }

    throw new ConflictException(
      describeConflicts(conflicts, { email, username }),
    );
  }
}

/** Message used for every 404 path, so they cannot drift apart. */
function notFoundMessage(id: string): string {
  return `User ${id} was not found`;
}

/**
 * Builds the `WHERE` for the list endpoint.
 *
 * The three parameters are independent and combine with `AND`: `?role=ADMIN`
 * narrows whatever `?search=` matched rather than replacing it. Returns
 * `undefined` — not an empty object — when nothing was requested, because
 * `undefined` is what `findMany` and `count` both read as "no filter", and the
 * two must agree or the total would not describe the page.
 */
function buildWhere({
  search,
  role,
  isActive,
}: UserQueryDto): Prisma.UserWhereInput | undefined {
  const filters: Prisma.UserWhereInput[] = [];

  if (search !== undefined && search.length > 0) {
    filters.push({
      OR: [
        { email: { contains: search, ...CASE_INSENSITIVE } },
        { username: { contains: search, ...CASE_INSENSITIVE } },
      ],
    });
  }

  if (role !== undefined) {
    filters.push({ role });
  }

  if (isActive !== undefined) {
    filters.push({ isActive });
  }

  return filters.length === 0 ? undefined : { AND: filters };
}

/**
 * Orders by the requested column, then by `id`.
 *
 * The tie-break is what makes pagination safe: `role`, `createdAt` and the
 * nullable `username` are none of them unique, and two rows sharing a value
 * could otherwise be returned in a different relative order on each query,
 * letting a record repeat on one page and vanish from the next.
 */
function buildOrderBy(
  sortBy: UserSortField,
  sortOrder: SortOrder,
): Prisma.UserOrderByWithRelationInput[] {
  return [{ [sortBy]: sortOrder }, { id: SortOrder.ASC }];
}

/** Names which of the submitted fields are already taken. */
function describeConflicts(
  conflicts: readonly UniqueUserFields[],
  { email, username }: UniqueUserFields,
): string[] {
  const messages: string[] = [];

  if (
    email !== undefined &&
    conflicts.some((it) => equalsIgnoringCase(it.email, email))
  ) {
    messages.push(`A user with email "${email}" already exists`);
  }

  if (
    username !== undefined &&
    username !== null &&
    conflicts.some((it) => equalsIgnoringCase(it.username, username))
  ) {
    messages.push(`A user with username "${username}" already exists`);
  }

  // Reached only if PostgreSQL and JavaScript disagree about case folding for
  // some character; the row is a genuine conflict either way, so it is reported
  // rather than swallowed into a 500.
  return messages.length > 0
    ? messages
    : ['A user with this email or username already exists'];
}

function equalsIgnoringCase(
  left: string | null | undefined,
  right: string,
): boolean {
  return left?.toLowerCase() === right.toLowerCase();
}
