import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SortOrder } from '../../common/enums/sort-order.enum';
import type { DepartmentModel } from '../../generated/prisma/models';
import { PrismaService } from '../../prisma/prisma.service';
import { DepartmentService } from './department.service';
import { DepartmentQueryDto } from './dto/department-query.dto';

/** A row as PostgreSQL returns it — `Date` objects, not strings. */
const DEPARTMENT: DepartmentModel = {
  id: 'dep-1',
  code: 'DEV',
  name: 'Development',
  description: 'Software design, implementation and code review.',
  isActive: true,
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  updatedAt: new Date('2026-08-02T11:30:00.000Z'),
};

/** The same row once mapped for the API. */
const DEPARTMENT_ENTITY = {
  id: 'dep-1',
  code: 'DEV',
  name: 'Development',
  description: 'Software design, implementation and code review.',
  isActive: true,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T11:30:00.000Z',
};

const defaultQuery = (
  overrides: Partial<DepartmentQueryDto> = {},
): DepartmentQueryDto =>
  Object.assign(new DepartmentQueryDto(), overrides) as DepartmentQueryDto;

describe('DepartmentService', () => {
  let service: DepartmentService;
  let prisma: {
    department: {
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
    prisma = {
      department: {
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
      providers: [
        DepartmentService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(DepartmentService);
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.department.findMany.mockResolvedValue([DEPARTMENT]);
      prisma.department.count.mockResolvedValue(1);
    });

    it('returns the mapped page with its metadata', async () => {
      const result = await service.findAll(defaultQuery());

      expect(result).toEqual({
        items: [DEPARTMENT_ENTITY],
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

    it('translates the page request into skip and take', async () => {
      await service.findAll(defaultQuery({ page: 3, limit: 10 }));

      expect(prisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('orders by the requested column and breaks ties on id', async () => {
      await service.findAll(
        defaultQuery({ sortBy: 'createdAt', sortOrder: SortOrder.DESC }),
      );

      expect(prisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
      );
    });

    it('searches code and name case-insensitively', async () => {
      await service.findAll(defaultQuery({ search: 'dev' }));

      expect(prisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { code: { contains: 'dev', mode: 'insensitive' } },
              { name: { contains: 'dev', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('applies no filter when no search term was given', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });

    it('counts with the same filter the page was read with', async () => {
      await service.findAll(defaultQuery({ search: 'dev' }));

      const [{ where: listedWith }] = prisma.department.findMany.mock
        .calls[0] as [{ where: unknown }];
      const [{ where: countedWith }] = prisma.department.count.mock
        .calls[0] as [{ where: unknown }];

      expect(countedWith).toEqual(listedWith);
    });

    it('reads the rows and the total under one transaction', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('returns the mapped department', async () => {
      prisma.department.findUnique.mockResolvedValue(DEPARTMENT);

      await expect(service.findOne('dep-1')).resolves.toEqual(
        DEPARTMENT_ENTITY,
      );
    });

    it('throws 404 for an unknown id', async () => {
      prisma.department.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('creates and returns the department when nothing collides', async () => {
      prisma.department.findMany.mockResolvedValue([]);
      prisma.department.create.mockResolvedValue(DEPARTMENT);

      await expect(
        service.create({ code: 'DEV', name: 'Development' }),
      ).resolves.toEqual(DEPARTMENT_ENTITY);
    });

    it('checks the code and the name case-insensitively', async () => {
      prisma.department.findMany.mockResolvedValue([]);
      prisma.department.create.mockResolvedValue(DEPARTMENT);

      await service.create({ code: 'DEV', name: 'Development' });

      expect(prisma.department.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { code: { equals: 'DEV', mode: 'insensitive' } },
            { name: { equals: 'Development', mode: 'insensitive' } },
          ],
        },
        select: { code: true, name: true },
      });
    });

    it('rejects a duplicate code', async () => {
      prisma.department.findMany.mockResolvedValue([
        { code: 'DEV', name: 'Something else' },
      ]);

      await expect(
        service.create({ code: 'DEV', name: 'Development' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.department.create).not.toHaveBeenCalled();
    });

    it('reports the code and the name together when both are taken', async () => {
      prisma.department.findMany.mockResolvedValue([
        { code: 'DEV', name: 'Something else' },
        { code: 'OTHER', name: 'Development' },
      ]);

      await expect(
        service.create({ code: 'DEV', name: 'Development' }),
      ).rejects.toMatchObject({
        response: {
          message: [
            'A department with code "DEV" already exists',
            'A department with name "Development" already exists',
          ],
        },
      });
    });
  });

  describe('update', () => {
    it('reports a missing department before looking for conflicts', async () => {
      prisma.department.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing', { code: 'DEV' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.department.findMany).not.toHaveBeenCalled();
    });

    it('does not treat the department as a conflict with itself', async () => {
      prisma.department.findUnique.mockResolvedValue(DEPARTMENT);
      prisma.department.findMany.mockResolvedValue([]);
      prisma.department.update.mockResolvedValue(DEPARTMENT);

      await service.update('dep-1', { name: 'Development' });

      expect(prisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ NOT: { id: 'dep-1' } }) as unknown,
        }),
      );
    });

    it('skips the uniqueness query when neither code nor name changes', async () => {
      prisma.department.findUnique.mockResolvedValue(DEPARTMENT);
      prisma.department.update.mockResolvedValue(DEPARTMENT);

      await service.update('dep-1', { isActive: false });

      expect(prisma.department.findMany).not.toHaveBeenCalled();
    });

    it('leaves omitted fields undefined so Prisma keeps them', async () => {
      prisma.department.findUnique.mockResolvedValue(DEPARTMENT);
      prisma.department.findMany.mockResolvedValue([]);
      prisma.department.update.mockResolvedValue(DEPARTMENT);

      await service.update('dep-1', { name: 'Engineering' });

      expect(prisma.department.update).toHaveBeenCalledWith({
        where: { id: 'dep-1' },
        data: {
          code: undefined,
          name: 'Engineering',
          description: undefined,
          isActive: undefined,
        },
      });
    });

    it('rejects a name already held by another department', async () => {
      prisma.department.findUnique.mockResolvedValue(DEPARTMENT);
      prisma.department.findMany.mockResolvedValue([
        { code: 'MAINT', name: 'Maintenance' },
      ]);

      await expect(
        service.update('dep-1', { name: 'Maintenance' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.department.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes a department nobody is assigned to', async () => {
      prisma.department.findUnique.mockResolvedValue({
        _count: { employees: 0 },
      });

      await expect(service.remove('dep-1')).resolves.toBeUndefined();
      expect(prisma.department.delete).toHaveBeenCalledWith({
        where: { id: 'dep-1' },
      });
    });

    it('throws 404 for an unknown id', async () => {
      prisma.department.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.department.delete).not.toHaveBeenCalled();
    });

    it('throws 409 while employees still reference it', async () => {
      prisma.department.findUnique.mockResolvedValue({
        _count: { employees: 4 },
      });

      await expect(service.remove('dep-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.department.delete).not.toHaveBeenCalled();
    });
  });
});
