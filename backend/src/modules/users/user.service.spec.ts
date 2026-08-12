import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SortOrder } from '../../common/enums/sort-order.enum';
import {
  AccountStatus,
  AccountTokenType,
  UserRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountEmailService } from '../auth/account-email.service';
import { AccountTokenService } from '../auth/account-token.service';
import { AuthService } from '../auth/auth.service';
import { UserQueryDto } from './dto/user-query.dto';
import { USER_PUBLIC_SELECT } from './entities/user.entity';
import { UserService } from './user.service';

/**
 * Hashing is **not** mocked here any more, because it does not happen here any
 * more.
 *
 * Feature 036 took the password out of this module entirely: an account is
 * created with none, and the only party who ever knows one is its owner. That is
 * the single biggest change to this spec — the tests that asserted "stores the
 * bcrypt hash" and "re-hashes when a new password is supplied" describe an API
 * that no longer exists, and they are replaced below by tests that a created
 * account is `PENDING_ACTIVATION` and gets an invitation instead.
 */

/**
 * A row as PostgreSQL returns it through `USER_PUBLIC_SELECT` — `Date` objects,
 * not strings, and no `passwordHash`.
 */
const USER = {
  id: 'usr-1',
  email: 'ana.pop@example.com',
  username: 'APO',
  role: UserRole.ADMIN,
  status: AccountStatus.ACTIVE,
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  updatedAt: new Date('2026-08-02T11:30:00.000Z'),
};

/** The same row once mapped for the API. */
const USER_ENTITY = {
  id: 'usr-1',
  email: 'ana.pop@example.com',
  username: 'APO',
  role: UserRole.ADMIN,
  status: AccountStatus.ACTIVE,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T11:30:00.000Z',
};

/** No `password`: `POST /users` no longer accepts one. */
const VALID_CREATE = {
  email: 'ana.pop@example.com',
  username: 'APO',
  role: UserRole.ADMIN,
};

const ISSUED = {
  token: 'a-link-secret',
  expiresAt: new Date('2026-08-04T10:00:00.000Z'),
};

const defaultQuery = (overrides: Partial<UserQueryDto> = {}): UserQueryDto =>
  Object.assign(new UserQueryDto(), overrides) as UserQueryDto;

describe('UserService', () => {
  let service: UserService;
  let prisma: {
    user: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let accountTokens: {
    issue: jest.Mock;
    ttlSeconds: jest.Mock;
  };
  let accountEmails: { sendActivation: jest.Mock };
  let auth: { revokeSessions: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      // Two shapes, because the service uses both. `findAll` passes an array of
      // already-issued promises, and `create`/`deactivate` pass a callback that
      // wants a transaction client — here, the same mocked delegates, which is
      // what lets a test assert on `prisma.user.create` either way.
      $transaction: jest.fn(
        (arg: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) =>
          typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
      ),
    };

    accountTokens = {
      issue: jest.fn().mockResolvedValue(ISSUED),
      ttlSeconds: jest.fn().mockReturnValue(259_200),
    };
    accountEmails = { sendActivation: jest.fn().mockResolvedValue(undefined) };
    auth = { revokeSessions: jest.fn().mockResolvedValue(0) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountTokenService, useValue: accountTokens },
        { provide: AccountEmailService, useValue: accountEmails },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();

    service = moduleRef.get(UserService);
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([USER]);
      prisma.user.count.mockResolvedValue(1);
    });

    it('returns the mapped page with its metadata', async () => {
      const result = await service.findAll(defaultQuery());

      expect(result).toEqual({
        items: [USER_ENTITY],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      });
    });

    it('never asks PostgreSQL for the password hash', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: USER_PUBLIC_SELECT }),
      );
      expect(USER_PUBLIC_SELECT).not.toHaveProperty('passwordHash');
    });

    it('translates the page request into skip and take', async () => {
      await service.findAll(defaultQuery({ page: 3, limit: 10 }));

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('orders by the requested column and breaks ties on id', async () => {
      await service.findAll(
        defaultQuery({ sortBy: 'createdAt', sortOrder: SortOrder.DESC }),
      );

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
      );
    });

    it('searches email and username case-insensitively', async () => {
      await service.findAll(defaultQuery({ search: 'ana' }));

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: [
                  { email: { contains: 'ana', mode: 'insensitive' } },
                  { username: { contains: 'ana', mode: 'insensitive' } },
                ],
              },
            ],
          },
        }),
      );
    });

    it('filters by role', async () => {
      await service.findAll(defaultQuery({ role: UserRole.HR }));

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [{ role: UserRole.HR }] } }),
      );
    });

    /**
     * `?status=` replaced `?isActive=` in Feature 036. The state a screen
     * actually reaches for is the third one the boolean could not express.
     */
    it.each([
      AccountStatus.PENDING_ACTIVATION,
      AccountStatus.ACTIVE,
      AccountStatus.DISABLED,
    ])('filters by status=%s', async (status) => {
      await service.findAll(defaultQuery({ status }));

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [{ status }] } }),
      );
    });

    it('combines search and both filters with AND', async () => {
      await service.findAll(
        defaultQuery({
          search: 'ana',
          role: UserRole.ADMIN,
          status: AccountStatus.ACTIVE,
        }),
      );

      const [{ where }] = prisma.user.findMany.mock.calls[0] as [
        { where: { AND: unknown[] } },
      ];

      expect(where.AND).toHaveLength(3);
    });

    it('applies no filter when nothing was requested', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });

    it('counts with the same filter the page was read with', async () => {
      await service.findAll(
        defaultQuery({ search: 'ana', status: AccountStatus.ACTIVE }),
      );

      const [{ where: listedWith }] = prisma.user.findMany.mock.calls[0] as [
        { where: unknown },
      ];
      const [{ where: countedWith }] = prisma.user.count.mock.calls[0] as [
        { where: unknown },
      ];

      expect(countedWith).toEqual(listedWith);
    });

    it('reads the rows and the total under one transaction', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('returns the mapped user without a password hash', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);

      const user = await service.findOne('usr-1');

      expect(user).toEqual(USER_ENTITY);
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('throws 404 for an unknown id', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.create.mockResolvedValue(USER);
    });

    it('creates and returns the user when nothing collides', async () => {
      await expect(service.create(VALID_CREATE)).resolves.toEqual(USER_ENTITY);
    });

    /**
     * The central claim of Feature 036's onboarding half: an account is born
     * with **no password at all**, so there is nothing for anybody — including
     * the administrator who created it — to know.
     */
    it('creates the account pending, with no password of any kind', async () => {
      await service.create(VALID_CREATE);

      const [{ data }] = prisma.user.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];

      expect(data.status).toBe(AccountStatus.PENDING_ACTIVATION);
      expect(data).not.toHaveProperty('passwordHash');
      expect(data).not.toHaveProperty('password');
    });

    it('issues an activation token for the new account', async () => {
      await service.create(VALID_CREATE);

      expect(accountTokens.issue).toHaveBeenCalledWith(
        'usr-1',
        AccountTokenType.ACTIVATION,
        prisma,
      );
    });

    /**
     * The row and its invitation are one transaction: an account nobody can
     * onboard is invisible until somebody asks why they never got an email.
     */
    it('writes the account and its token in one transaction', async () => {
      await service.create(VALID_CREATE);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction.mock.calls[0][0]).toEqual(
        expect.any(Function),
      );
    });

    it('emails the link, and the link secret only', async () => {
      await service.create(VALID_CREATE);

      expect(accountEmails.sendActivation).toHaveBeenCalledWith({
        to: 'ana.pop@example.com',
        token: ISSUED.token,
        expiresAt: ISSUED.expiresAt,
      });
    });

    /** The token is never in the response — it belongs in an inbox and nowhere else. */
    it('does not return the token to the caller', async () => {
      const created = await service.create(VALID_CREATE);

      expect(JSON.stringify(created)).not.toContain(ISSUED.token);
      expect(created).not.toHaveProperty('token');
    });

    /**
     * A mail server that is briefly down must not destroy a perfectly good
     * account. The administrator resends from the accounts screen.
     */
    it('keeps the account when the invitation cannot be sent', async () => {
      accountEmails.sendActivation.mockRejectedValue(new Error('smtp down'));

      await expect(service.create(VALID_CREATE)).resolves.toEqual(USER_ENTITY);
    });

    /**
     * Given a transaction, it joins it rather than opening a second one — which
     * is what lets `POST /employees` create an employee and their login as one
     * unit. The stub carries `findMany` as well as `create` because the
     * uniqueness check runs inside the caller's transaction too, so that it sees
     * rows the same transaction has already written.
     */
    it('uses the caller’s transaction when one is supplied', async () => {
      const tx = {
        user: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue(USER),
        },
      };

      await service.create(
        VALID_CREATE,
        tx as unknown as Parameters<typeof service.create>[1],
      );

      expect(tx.user.create).toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('checks the email and the username case-insensitively', async () => {
      await service.create(VALID_CREATE);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            {
              email: {
                equals: 'ana.pop@example.com',
                mode: 'insensitive',
              },
            },
            { username: { equals: 'APO', mode: 'insensitive' } },
          ],
        },
        select: { email: true, username: true },
      });
    });

    it('does not look for a username conflict when there is no username', async () => {
      await service.create({ ...VALID_CREATE, username: null });

      const [{ where }] = prisma.user.findMany.mock.calls[0] as [
        { where: { OR: unknown[] } },
      ];

      expect(where.OR).toHaveLength(1);
    });

    it('rejects a duplicate email', async () => {
      prisma.user.findMany.mockResolvedValue([
        { email: 'ana.pop@example.com', username: 'OTHER' },
      ]);

      await expect(service.create(VALID_CREATE)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('reports the email and the username together when both are taken', async () => {
      prisma.user.findMany.mockResolvedValue([
        { email: 'ana.pop@example.com', username: 'OTHER' },
        { email: 'other@example.com', username: 'APO' },
      ]);

      await expect(service.create(VALID_CREATE)).rejects.toMatchObject({
        response: {
          message: [
            'A user with email "ana.pop@example.com" already exists',
            'A user with username "APO" already exists',
          ],
        },
      });
    });

    /**
     * A conflicting request must not invite anybody. The address it would have
     * written to belongs to an account that already exists, so a message would
     * arrive at a real mailbox announcing an account the recipient did not get.
     */
    it('neither issues a token nor sends mail when the request conflicts', async () => {
      prisma.user.findMany.mockResolvedValue([
        { email: 'ana.pop@example.com', username: null },
      ]);

      await expect(service.create(VALID_CREATE)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(accountTokens.issue).not.toHaveBeenCalled();
      expect(accountEmails.sendActivation).not.toHaveBeenCalled();
    });
  });

  describe('resendActivation', () => {
    it('issues a fresh link and emails it for a pending account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr-1',
        email: 'ana.pop@example.com',
        status: AccountStatus.PENDING_ACTIVATION,
      });

      await service.resendActivation('usr-1');

      expect(accountTokens.issue).toHaveBeenCalledWith(
        'usr-1',
        AccountTokenType.ACTIVATION,
      );
      expect(accountEmails.sendActivation).toHaveBeenCalledWith(
        expect.objectContaining({ token: ISSUED.token }),
      );
    });

    /**
     * Somebody who has activated and forgotten their password needs a *reset*,
     * which is theirs to request. Re-inviting them would be an administrator
     * solving the wrong problem.
     */
    it.each([AccountStatus.ACTIVE, AccountStatus.DISABLED])(
      'refuses a %s account with a coded 409',
      async (status) => {
        prisma.user.findUnique.mockResolvedValue({
          id: 'usr-1',
          email: 'ana.pop@example.com',
          status,
        });

        await expect(service.resendActivation('usr-1')).rejects.toMatchObject({
          response: {
            errorCode: 'ACCOUNT_NOT_PENDING_ACTIVATION',
            params: { status },
          },
        });
        expect(accountTokens.issue).not.toHaveBeenCalled();
      },
    );

    it('throws 404 for an unknown id', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.resendActivation('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('activate', () => {
    it('re-enables a disabled account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        status: AccountStatus.DISABLED,
      });
      prisma.user.update.mockResolvedValue(USER);

      await expect(service.activate('usr-1')).resolves.toEqual(USER_ENTITY);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'usr-1' },
        data: { status: AccountStatus.ACTIVE },
        select: USER_PUBLIC_SELECT,
      });
    });

    /**
     * There would be no password to activate it *with*: the result would be an
     * `ACTIVE` account whose owner meets "invalid email or password" forever.
     */
    it('refuses a pending account, which has no password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        status: AccountStatus.PENDING_ACTIVATION,
      });

      await expect(service.activate('usr-1')).rejects.toMatchObject({
        response: { errorCode: 'ACCOUNT_NOT_PENDING_ACTIVATION' },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws 404 for an unknown id', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.activate('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('deactivate', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        status: AccountStatus.ACTIVE,
      });
      prisma.user.update.mockResolvedValue({
        ...USER,
        status: AccountStatus.DISABLED,
      });
    });

    it('disables the account', async () => {
      await expect(service.deactivate('usr-1')).resolves.toEqual({
        ...USER_ENTITY,
        status: AccountStatus.DISABLED,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'usr-1' },
        data: { status: AccountStatus.DISABLED },
        select: USER_PUBLIC_SELECT,
      });
    });

    /**
     * Without this the account keeps working until its refresh token expires —
     * up to a week — and "we disabled their account" would mean "next Tuesday".
     */
    it('revokes the account’s live sessions, in the same transaction', async () => {
      await service.deactivate('usr-1');

      expect(auth.revokeSessions).toHaveBeenCalledWith('usr-1', { tx: prisma });
    });

    it('works on a pending account, stopping an invitation sent in error', async () => {
      prisma.user.findUnique.mockResolvedValue({
        status: AccountStatus.PENDING_ACTIVATION,
      });

      await expect(service.deactivate('usr-1')).resolves.toMatchObject({
        status: AccountStatus.DISABLED,
      });
    });

    it('throws 404 for an unknown id', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.deactivate('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('reports a missing user before looking for conflicts', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing', { username: 'APO' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('does not treat the user as a conflict with itself', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'usr-1' });
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.update.mockResolvedValue(USER);

      await service.update('usr-1', { username: 'APO' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ NOT: { id: 'usr-1' } }) as unknown,
        }),
      );
    });

    it('skips the uniqueness query when the username does not change', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'usr-1' });
      prisma.user.update.mockResolvedValue(USER);

      await service.update('usr-1', { role: UserRole.HR });

      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('leaves omitted fields undefined so Prisma keeps them', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'usr-1' });
      prisma.user.update.mockResolvedValue(USER);

      await service.update('usr-1', { role: UserRole.HR });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'usr-1' },
        data: { username: undefined, role: UserRole.HR },
        select: USER_PUBLIC_SELECT,
      });
    });

    /**
     * The patch can no longer touch a password or a status, and the assertion is
     * on the *written data* rather than on the DTO — a field the type rejects but
     * the service still wrote would be the failure this catches.
     */
    it('never writes a password or a status, whatever was sent', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'usr-1' });
      prisma.user.update.mockResolvedValue(USER);

      await service.update('usr-1', {
        role: UserRole.HR,
        // Cast, because the DTO has no such properties — which is the point:
        // the pipe rejects them at the edge, and this proves the service would
        // ignore them even if one arrived.
        ...({ password: 'smuggled', status: AccountStatus.ACTIVE } as object),
      });

      const [{ data }] = prisma.user.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];

      expect(data).not.toHaveProperty('passwordHash');
      expect(data).not.toHaveProperty('password');
      expect(data).not.toHaveProperty('status');
    });

    it('clears the username on an explicit null', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'usr-1' });
      prisma.user.update.mockResolvedValue({ ...USER, username: null });

      await service.update('usr-1', { username: null });

      // Null is a value to write, not a value to search for.
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ username: null }) as unknown,
        }),
      );
    });

    it('rejects a username already held by another user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'usr-1' });
      prisma.user.findMany.mockResolvedValue([
        { email: 'other@example.com', username: 'MIO' },
      ]);

      await expect(
        service.update('usr-1', { username: 'MIO' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('returns the updated user without a password hash', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'usr-1' });
      prisma.user.update.mockResolvedValue(USER);

      await expect(
        service.update('usr-1', { role: UserRole.ADMIN }),
      ).resolves.toEqual(USER_ENTITY);
    });
  });

  describe('remove', () => {
    it('deletes an account no employee is linked to', async () => {
      prisma.user.findUnique.mockResolvedValue({ employee: null });

      await expect(service.remove('usr-1')).resolves.toBeUndefined();
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'usr-1' },
      });
    });

    it('throws 404 for an unknown id', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('throws 409 while an employee still references it', async () => {
      prisma.user.findUnique.mockResolvedValue({
        employee: { id: 'emp-1' },
      });

      await expect(service.remove('usr-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('names the employee in the conflict, so the caller knows what to fix', async () => {
      prisma.user.findUnique.mockResolvedValue({ employee: { id: 'emp-1' } });

      await expect(service.remove('usr-1')).rejects.toMatchObject({
        response: {
          message:
            'User usr-1 cannot be deleted while employee emp-1 is linked to it',
        },
      });
    });
  });

  /**
   * The hand-off to the employees module. It answers two questions from one
   * read — does the account exist, and is an employee already holding it —
   * because linking a user requires both, and `remove` above needs the same
   * pair.
   */
  describe('findEmployeeLink', () => {
    it('reports a free account', async () => {
      prisma.user.findUnique.mockResolvedValue({ employee: null });

      await expect(service.findEmployeeLink('usr-1')).resolves.toEqual({
        employeeId: null,
      });
    });

    it('names the employee already holding the account', async () => {
      prisma.user.findUnique.mockResolvedValue({ employee: { id: 'emp-1' } });

      await expect(service.findEmployeeLink('usr-1')).resolves.toEqual({
        employeeId: 'emp-1',
      });
    });

    it('returns null when there is no such account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findEmployeeLink('missing')).resolves.toBeNull();
    });

    it('reads nothing but ids, so no secret is pulled out of PostgreSQL', async () => {
      prisma.user.findUnique.mockResolvedValue({ employee: null });

      await service.findEmployeeLink('usr-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'usr-1' },
        select: { employee: { select: { id: true } } },
      });
    });
  });

  // The bulk counterpart, added for the Notification Delivery Engine: a
  // company-wide campaign addresses a notification to every employee's account,
  // and one lookup per name would be a round trip per person.
  describe('findExistingIds', () => {
    it('answers with the ids that were found', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'usr-1' },
        { id: 'usr-3' },
      ]);

      await expect(
        service.findExistingIds(['usr-1', 'usr-2', 'usr-3']),
      ).resolves.toEqual(['usr-1', 'usr-3']);
    });

    it('asks about the whole set in one query', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.findExistingIds(['usr-1', 'usr-2']);

      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['usr-1', 'usr-2'] } },
        select: { id: true },
      });
    });

    it('reads nothing but ids', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.findExistingIds(['usr-1']);

      expect(
        (prisma.user.findMany.mock.calls[0][0] as { select: unknown }).select,
      ).toEqual({ id: true });
    });
  });
});
