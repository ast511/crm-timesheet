import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { ERROR_CODES } from '../../common/constants/error-codes.constants';
import { codedError } from '../../common/errors/coded-error';
import { SortOrder } from '../../common/enums/sort-order.enum';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import {
  buildPaginatedResult,
  toSkipTake,
} from '../../common/utils/pagination.util';
import type { Prisma } from '../../generated/prisma/client';
import {
  AccountStatus,
  AccountTokenType,
  type UserRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountEmailService } from '../auth/account-email.service';
import {
  AccountTokenService,
  IssuedAccountToken,
} from '../auth/account-token.service';
import { AuthService } from '../auth/auth.service';
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

/** What an existing account says about the employee holding it. */
export interface UserEmployeeLink {
  /** Id of the employee already linked to the account, or `null` if free. */
  readonly employeeId: string | null;
}

/**
 * Every rule about users lives here; the controller only routes.
 *
 * Three concerns are specific to this module and shape most of what follows:
 *
 * 1. **No password passes through this class at all, as of Feature 036.** It
 *    used to arrive as plain text and be hashed here; now an account is created
 *    with none, and the only party who ever knows one is the person it belongs
 *    to. `hashPassword` is not imported. No method returns a hash and no method
 *    reads one back — every Prisma call uses `USER_PUBLIC_SELECT`, so
 *    `passwordHash` is not even transferred out of PostgreSQL.
 * 2. **Deleting an account is not deleting a person.** `Employee.userId` is
 *    required, so a user with an employee is load-bearing; `remove` refuses
 *    rather than cascading. Feature 036 left that behaviour exactly as it was
 *    and added {@link deactivate} beside it, which is the lifecycle action —
 *    disabling is what happens to a leaver, and deleting is what happens to an
 *    account created by mistake.
 * 3. **Every write here is an act of account administration**, and the
 *    controller refuses anybody who is not `ADMIN` or `SUPERADMIN` before it
 *    arrives. See `user.rules.ts` for why that is a role check rather than a
 *    permission gate.
 *
 * ## Onboarding lives half here and half in `auth`
 *
 * This module owns the account; the auth module owns the credential mechanism.
 * So creating an account writes the row here and asks `AccountTokenService` for
 * an invitation link, and the person who follows that link is handled entirely
 * over there by `AccountPasswordService`. The seam is two injected services and
 * a one-way dependency: users → auth, never back.
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountTokens: AccountTokenService,
    private readonly accountEmails: AccountEmailService,
    private readonly auth: AuthService,
  ) {}

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
   * Creates an account and emails its owner an invitation link.
   *
   * **The account is unusable when this returns**, deliberately: it is
   * `PENDING_ACTIVATION` with a null `passwordHash`, so nobody — including the
   * administrator who just created it — can sign in as it. It becomes usable
   * when the person follows the link and chooses a password, which is the only
   * moment a password for this account exists anywhere. See
   * `AccountPasswordService.activate`.
   *
   * **The row and its invitation are one transaction.** An account with no token
   * is a person nobody can onboard and nothing can detect — the administrator
   * sees a created account, the employee never receives anything, and the only
   * symptom is a colleague asking a week later. Writing both or neither makes
   * that state unreachable.
   *
   * **Sending the email is outside the transaction, and its failure does not
   * undo the account.** The ordering is the interesting part: a transaction held
   * open across an SMTP conversation would hold a database connection for the
   * length of somebody else's network timeout, and rolling the account back
   * because a mail server was briefly down would destroy a perfectly good record
   * while leaving the administrator to retype it. The account and its token
   * survive, the failure is logged, and the fix is one click of
   * {@link resendActivation} — which is the same operation the person would need
   * anyway if the mail were merely slow, or filtered, or deleted.
   *
   * Accepts an optional transaction so that `POST /employees` can create an
   * employee and their login as one unit. In that case the caller supplies the
   * transaction and this method never opens its own; the email is still sent
   * after the caller's transaction commits, for the reason above.
   */
  async create(
    dto: CreateUserDto,
    tx?: Prisma.TransactionClient,
  ): Promise<UserEntity> {
    await this.assertEmailAndUsernameAreFree(dto, undefined, tx);

    const created = tx
      ? await this.insertPendingAccount(dto, tx)
      : await this.prisma.$transaction((inner) =>
          this.insertPendingAccount(dto, inner),
        );

    await this.sendActivationEmail(created.user, created.issued);

    return created.user;
  }

  /**
   * Emails a fresh invitation, invalidating whatever link was outstanding.
   *
   * For the ordinary case — somebody's link expired over a long weekend, or the
   * email never arrived, or it went to spam and was deleted. **Only an account
   * administrator can trigger it**, and that is a consequence of the design
   * rather than a restriction bolted on: the person who needs a new link cannot
   * sign in, so there is no authenticated route by which they could ask for one
   * themselves, and an unauthenticated "resend my invitation" endpoint would be
   * an open way to have this company's mail server deliver messages to any
   * address somebody named. Forgetting a password once you *have* one is
   * self-service — that is `POST /auth/forgot-password`.
   *
   * **Refused for anything but `PENDING_ACTIVATION`**, with a specific code and
   * the state the account is actually in. Unlike a public endpoint this one can
   * afford to be precise: the caller is a named administrator looking at the
   * account on a screen, and telling them "this person activated in March" is
   * what stops them re-sending invitations to a colleague who simply forgot a
   * password. There is no enumeration concern — they already listed the account.
   *
   * Issuing invalidates the previous link, held by the unique `(user, type)` pair
   * rather than by remembering to revoke: only one invitation can ever be live,
   * so an old email found in an inbox months later opens a dead page.
   */
  async resendActivation(id: string): Promise<void> {
    const account = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, status: true },
    });

    if (account === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    if (account.status !== AccountStatus.PENDING_ACTIVATION) {
      throw new ConflictException(
        codedError(
          ERROR_CODES.ACCOUNT_NOT_PENDING_ACTIVATION,
          `Account ${id} is ${account.status} and has already been activated; a forgotten password is reset by its owner through the password reset flow`,
          { status: account.status },
        ),
      );
    }

    const issued = await this.accountTokens.issue(
      account.id,
      AccountTokenType.ACTIVATION,
    );

    await this.accountEmails.sendActivation({
      to: account.email,
      token: issued.token,
      expiresAt: issued.expiresAt,
    });
  }

  /**
   * Re-enables an account an administrator had disabled.
   *
   * **`DISABLED → ACTIVE` and nothing else.** The password survives a
   * deactivation, so re-enabling is genuinely one step and the person's own
   * credential still works — which is what makes disabling the right action for
   * somebody on long leave, or an account suspended while something is
   * investigated.
   *
   * A `PENDING_ACTIVATION` account cannot be activated this way and the refusal
   * is the point rather than a gap: there would be no password to activate it
   * *with*, so the result would be an `ACTIVE` account nobody can sign in to and
   * whose owner would meet "invalid email or password" forever. The route back
   * for that account is {@link resendActivation}, and the message says so.
   *
   * Idempotent on an account that is already `ACTIVE`: the update matches, writes
   * the same value, and answers with the account. Re-enabling something that is
   * already enabled is not an error a client needs to handle.
   */
  async activate(id: string): Promise<UserEntity> {
    const status = await this.findStatusOrThrow(id);

    if (status === AccountStatus.PENDING_ACTIVATION) {
      throw new ConflictException(
        codedError(
          ERROR_CODES.ACCOUNT_NOT_PENDING_ACTIVATION,
          `Account ${id} has never been activated by its owner and has no password, so it cannot be enabled here; resend its activation link instead`,
          { status },
        ),
      );
    }

    return toUserEntity(
      await this.prisma.user.update({
        where: { id },
        data: { status: AccountStatus.ACTIVE },
        select: USER_PUBLIC_SELECT,
      }),
    );
  }

  /**
   * Disables an account and ends every session it has open.
   *
   * **The lifecycle action, and deliberately not `DELETE /users/:id`.** Deleting
   * is for an account created by mistake; this is for a person who has left, is
   * on long leave, or whose access is being suspended. The row survives with
   * everything that points at it — their timesheets, their leave, their audit
   * trail — and the account can be turned back on.
   *
   * **Revoking the sessions is what makes it take effect now.** Without it a
   * disabled account keeps working until its refresh token expires, which is up
   * to `JWT_REFRESH_TTL` — a week by default — and "we disabled their account"
   * would mean "we disabled their account, next Tuesday". `AuthService.authenticate`
   * re-reads the status on every request, so the residual window is one access
   * token's lifetime (`JWT_ACCESS_TTL`, fifteen minutes by default) and no
   * refresh will extend it. That is the stateless trade-off `RefreshToken`
   * argues in `schema.prisma`, and this is the shortest it can be made without
   * a revocation list on the access token.
   *
   * The status write and the revocation are one transaction: a disabled account
   * whose sessions survived is exactly the state this exists to prevent.
   *
   * It works on a `PENDING_ACTIVATION` account too, and that is useful rather
   * than incidental — an invitation sent to the wrong address is stopped by
   * disabling the account, which makes the outstanding link land on a page that
   * refuses it. Idempotent on an account that is already `DISABLED`.
   */
  async deactivate(id: string): Promise<UserEntity> {
    await this.findStatusOrThrow(id);

    const { account, revoked } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { status: AccountStatus.DISABLED },
        select: USER_PUBLIC_SELECT,
      });

      return {
        account: updated,
        revoked: await this.auth.revokeSessions(id, { tx }),
      };
    });

    this.logger.log(
      `Account ${id} was disabled; revoked ${String(revoked)} live session(s)`,
    );

    return toUserEntity(account);
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
      //
      // Two fields that used to be here are gone with Feature 036 and neither is
      // an oversight: `password`, because nobody sets somebody else's password
      // any more, and `isActive`, because enabling and disabling are transitions
      // with side effects rather than a column a patch may write. See
      // `UpdateUserDto`.
      data: {
        username: dto.username,
        role: dto.role,
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
    const link = await this.findEmployeeLink(id);

    if (link === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    if (link.employeeId !== null) {
      throw new ConflictException(
        `User ${id} cannot be deleted while employee ${link.employeeId} is linked to it`,
      );
    }

    await this.prisma.user.delete({ where: { id } });
  }

  /**
   * Reports whether an account exists and whether an employee already holds it,
   * in one query. `null` means there is no such account.
   *
   * Public because the employees module needs both answers before linking a
   * user — the account has to exist, and `Employee.userId` is unique, so it
   * must not already be taken — and this module owns the `users` table, which
   * is what keeps "never return the password hash" a rule with one enforcement
   * point. Nothing but ids is selected, so nothing sensitive is read.
   *
   * The two facts are returned rather than thrown, because a missing account is
   * a `404` when this module deletes one and a `400` when the employees module
   * validates a body; only the caller can tell which.
   */
  async findEmployeeLink(id: string): Promise<UserEmployeeLink | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { employee: { select: { id: true } } },
    });

    return user === null ? null : { employeeId: user.employee?.id ?? null };
  }

  /**
   * Which of these accounts exist, as a list of the ids that were found.
   *
   * Public for the reason {@link findEmployeeLink} is — this module owns the
   * `users` table, so another module confirms an account through it rather than
   * by querying the table — and separate from it because the question is
   * different: that one asks about one account and answers with a fact about it,
   * this asks about a *set* and answers which of it is real. The Notification
   * Delivery Engine is the first caller: a company-wide campaign addresses a
   * notification to every employee's account, and one lookup per name would be a
   * round trip per person to answer one question.
   *
   * It returns the ids that were **found** rather than the ones that were not,
   * because only the caller knows what a missing account means in its own request.
   * `id` alone is selected, so nothing sensitive is read — the same guarantee
   * every query in this class keeps.
   *
   * The spelling deliberately matches `EmployeeService.findExistingIds`: the two
   * answer the same question about different tables, and a second name for it
   * would make a reader wonder which one they were looking at.
   */
  async findExistingIds(ids: readonly string[]): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true },
    });

    return users.map(({ id }) => id);
  }

  /**
   * The role an account holds, or `null` when there is no such account.
   *
   * Public for the reason {@link findEmployeeLink} and {@link findExistingIds}
   * are — this module owns the `users` table, so another module asks it rather
   * than querying the table — and added by the caller that needed it, which is
   * the pattern Feature 028 followed when the delivery engine needed three
   * methods on `NotificationCampaignService`.
   *
   * That caller is Feature 029's permission management, and the role is the one
   * fact it cannot do without: a user's effective permissions are their role's
   * baseline plus their own exceptions, so resolving anybody's permissions
   * begins by asking which role they hold. It also decides whether the account
   * may be written to at all — a super-admin's permissions are neither stored
   * nor editable.
   *
   * The role is returned rather than thrown over, because a missing account is a
   * `404` when the permission matrix is read and a `400` naming a header when the
   * *caller* turns out not to exist; only the caller can tell which.
   *
   * `role` alone is selected, so nothing sensitive is read — the same guarantee
   * every query in this class keeps.
   */
  async findRole(id: string): Promise<UserRole | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });

    return user?.role ?? null;
  }

  /**
   * Writes the account row and its invitation together.
   *
   * The two statements that must not come apart, extracted so that
   * {@link create} can run them either inside a transaction it opens or inside
   * one the employees module already has open — without the transaction being
   * opened twice, which Prisma does not allow.
   *
   * The raw token comes back out with the account because it is needed exactly
   * once, to build the link, and it exists nowhere else. It is not returned by
   * `create` to its caller and never leaves this class except as an email.
   */
  private async insertPendingAccount(
    dto: CreateUserDto,
    tx: Prisma.TransactionClient,
  ): Promise<{ user: UserEntity; issued: IssuedAccountToken }> {
    const created = await tx.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        role: dto.role,
        // Stated rather than left to the schema default, because this is the one
        // place an account is born and the state it is born in is the whole
        // point of the feature. `passwordHash` is deliberately not set at all:
        // the column is null until its owner chooses one.
        status: AccountStatus.PENDING_ACTIVATION,
      },
      select: USER_PUBLIC_SELECT,
    });

    const issued = await this.accountTokens.issue(
      created.id,
      AccountTokenType.ACTIVATION,
      tx,
    );

    return { user: toUserEntity(created), issued };
  }

  /**
   * Sends the invitation, and refuses to let a mail failure lose an account.
   *
   * The account and its token are already committed by the time this runs, so
   * the worst case is a person who has not been invited yet rather than a person
   * whose record vanished — and that case is one click of
   * {@link resendActivation} away from fixed, by the administrator who is still
   * looking at the screen.
   *
   * Logged with the account id and nothing else. Not the address, which is
   * personal data; not the token, which would put a working invitation in the log
   * aggregator, where it would outlive the mailbox it was meant for.
   */
  private async sendActivationEmail(
    user: UserEntity,
    issued: IssuedAccountToken,
  ): Promise<void> {
    try {
      await this.accountEmails.sendActivation({
        to: user.email,
        token: issued.token,
        expiresAt: issued.expiresAt,
      });
    } catch (error) {
      this.logger.error(
        `Account ${user.id} was created but its activation email could not be sent; resend it from the accounts screen`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** The account's state, or a `404`. Reads one column and nothing else. */
  private async findStatusOrThrow(id: string): Promise<AccountStatus> {
    const account = await this.prisma.user.findUnique({
      where: { id },
      select: { status: true },
    });

    if (account === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    return account.status;
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
    tx?: Prisma.TransactionClient,
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

    // Runs inside the caller's transaction when there is one, so that creating
    // an employee and their account sees a consistent snapshot: without it the
    // check would read outside the transaction and could miss a row the same
    // transaction had just written.
    const conflicts = await (tx ?? this.prisma).user.findMany({
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
  status,
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

  if (status !== undefined) {
    filters.push({ status });
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
