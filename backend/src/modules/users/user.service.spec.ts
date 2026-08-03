import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SortOrder } from '../../common/enums/sort-order.enum';
import { hashPassword } from '../../common/password/password.hasher';
import { UserRole } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { UserQueryDto } from './dto/user-query.dto';
import { USER_PUBLIC_SELECT } from './entities/user.entity';
import { UserService } from './user.service';

/**
 * Hashing is mocked for two reasons: bcrypt at cost factor 12 costs a few
 * hundred milliseconds per call on the main thread, and what these tests are
 * about is *that* the service hashes — never that `bcryptjs` works, which is
 * `password.hasher.spec.ts`'s job.
 */
jest.mock('../../common/password/password.hasher', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed'),
}));

const hashPasswordMock = hashPassword as jest.MockedFunction<
  typeof hashPassword
>;

/**
 * A row as PostgreSQL returns it through `USER_PUBLIC_SELECT` — `Date` objects,
 * not strings, and no `passwordHash`.
 */
const USER = {
  id: 'usr-1',
  email: 'ana.pop@example.com',
  username: 'APO',
  role: UserRole.ADMIN,
  isActive: true,
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  updatedAt: new Date('2026-08-02T11:30:00.000Z'),
};

/** The same row once mapped for the API. */
const USER_ENTITY = {
  id: 'usr-1',
  email: 'ana.pop@example.com',
  username: 'APO',
  role: UserRole.ADMIN,
  isActive: true,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T11:30:00.000Z',
};

const VALID_CREATE = {
  email: 'ana.pop@example.com',
  username: 'APO',
  password: 'correct horse battery',
  role: UserRole.ADMIN,
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

  beforeEach(async () => {
    hashPasswordMock.mockClear();
    hashPasswordMock.mockResolvedValue('hashed');

    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      // The real client resolves the batch; the mock only has to await the
      // promises the mocked delegates already returned.
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [UserService, { provide: PrismaService, useValue: prisma }],
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

    it('filters by isActive, including the false case', async () => {
      await service.findAll(defaultQuery({ isActive: false }));

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [{ isActive: false }] } }),
      );
    });

    it('combines search and both filters with AND', async () => {
      await service.findAll(
        defaultQuery({ search: 'ana', role: UserRole.ADMIN, isActive: true }),
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
      await service.findAll(defaultQuery({ search: 'ana', isActive: true }));

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

    it('stores the bcrypt hash and never the plain password', async () => {
      await service.create(VALID_CREATE);

      expect(hashPasswordMock).toHaveBeenCalledWith('correct horse battery');

      const [{ data }] = prisma.user.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];

      expect(data.passwordHash).toBe('hashed');
      expect(data).not.toHaveProperty('password');
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

    it('does not spend a bcrypt round on a request that conflicts', async () => {
      prisma.user.findMany.mockResolvedValue([
        { email: 'ana.pop@example.com', username: null },
      ]);

      await expect(service.create(VALID_CREATE)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(hashPasswordMock).not.toHaveBeenCalled();
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

      await service.update('usr-1', { isActive: false });

      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('leaves omitted fields undefined so Prisma keeps them', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'usr-1' });
      prisma.user.update.mockResolvedValue(USER);

      await service.update('usr-1', { role: UserRole.HR });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'usr-1' },
        data: {
          username: undefined,
          passwordHash: undefined,
          role: UserRole.HR,
          isActive: undefined,
        },
        select: USER_PUBLIC_SELECT,
      });
      expect(hashPasswordMock).not.toHaveBeenCalled();
    });

    it('re-hashes when a new password is supplied', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'usr-1' });
      prisma.user.update.mockResolvedValue(USER);
      hashPasswordMock.mockResolvedValue('rehashed');

      await service.update('usr-1', { password: 'a whole new secret' });

      expect(hashPasswordMock).toHaveBeenCalledWith('a whole new secret');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordHash: 'rehashed',
          }) as unknown,
        }),
      );
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
        service.update('usr-1', { isActive: true }),
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
});
