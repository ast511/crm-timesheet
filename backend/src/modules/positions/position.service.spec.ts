import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SortOrder } from '../../common/enums/sort-order.enum';
import type { PositionModel } from '../../generated/prisma/models';
import { PrismaService } from '../../prisma/prisma.service';
import { PositionQueryDto } from './dto/position-query.dto';
import { PositionService } from './position.service';

/** A row as PostgreSQL returns it — `Date` objects, not strings. */
const POSITION: PositionModel = {
  id: 'pos-1',
  code: 'DEV',
  name: 'Developer',
  description: 'Designs and implements software.',
  isActive: true,
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  updatedAt: new Date('2026-08-02T11:30:00.000Z'),
};

/** The same row once mapped for the API. */
const POSITION_ENTITY = {
  id: 'pos-1',
  code: 'DEV',
  name: 'Developer',
  description: 'Designs and implements software.',
  isActive: true,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T11:30:00.000Z',
};

const defaultQuery = (
  overrides: Partial<PositionQueryDto> = {},
): PositionQueryDto =>
  Object.assign(new PositionQueryDto(), overrides) as PositionQueryDto;

describe('PositionService', () => {
  let service: PositionService;
  let prisma: {
    position: {
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
      position: {
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
        PositionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(PositionService);
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.position.findMany.mockResolvedValue([POSITION]);
      prisma.position.count.mockResolvedValue(1);
    });

    it('returns the mapped page with its metadata', async () => {
      const result = await service.findAll(defaultQuery());

      expect(result).toEqual({
        items: [POSITION_ENTITY],
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

      expect(prisma.position.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('orders by the requested column and breaks ties on id', async () => {
      await service.findAll(
        defaultQuery({ sortBy: 'createdAt', sortOrder: SortOrder.DESC }),
      );

      expect(prisma.position.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
      );
    });

    it('searches code and name case-insensitively', async () => {
      await service.findAll(defaultQuery({ search: 'dev' }));

      expect(prisma.position.findMany).toHaveBeenCalledWith(
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

      expect(prisma.position.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });

    it('counts with the same filter the page was read with', async () => {
      await service.findAll(defaultQuery({ search: 'dev' }));

      const [{ where: listedWith }] = prisma.position.findMany.mock
        .calls[0] as [{ where: unknown }];
      const [{ where: countedWith }] = prisma.position.count.mock.calls[0] as [
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
    it('returns the mapped position', async () => {
      prisma.position.findUnique.mockResolvedValue(POSITION);

      await expect(service.findOne('pos-1')).resolves.toEqual(POSITION_ENTITY);
    });

    it('throws 404 for an unknown id', async () => {
      prisma.position.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('creates and returns the position when nothing collides', async () => {
      prisma.position.findMany.mockResolvedValue([]);
      prisma.position.create.mockResolvedValue(POSITION);

      await expect(
        service.create({ code: 'DEV', name: 'Developer' }),
      ).resolves.toEqual(POSITION_ENTITY);
    });

    it('checks the code and the name case-insensitively', async () => {
      prisma.position.findMany.mockResolvedValue([]);
      prisma.position.create.mockResolvedValue(POSITION);

      await service.create({ code: 'DEV', name: 'Developer' });

      expect(prisma.position.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { code: { equals: 'DEV', mode: 'insensitive' } },
            { name: { equals: 'Developer', mode: 'insensitive' } },
          ],
        },
        select: { code: true, name: true },
      });
    });

    it('rejects a duplicate code', async () => {
      prisma.position.findMany.mockResolvedValue([
        { code: 'DEV', name: 'Something else' },
      ]);

      await expect(
        service.create({ code: 'DEV', name: 'Developer' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.position.create).not.toHaveBeenCalled();
    });

    it('reports the code and the name together when both are taken', async () => {
      prisma.position.findMany.mockResolvedValue([
        { code: 'DEV', name: 'Something else' },
        { code: 'OTHER', name: 'Developer' },
      ]);

      await expect(
        service.create({ code: 'DEV', name: 'Developer' }),
      ).rejects.toMatchObject({
        response: {
          message: [
            'A position with code "DEV" already exists',
            'A position with name "Developer" already exists',
          ],
        },
      });
    });
  });

  describe('update', () => {
    it('reports a missing position before looking for conflicts', async () => {
      prisma.position.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing', { code: 'DEV' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.position.findMany).not.toHaveBeenCalled();
    });

    it('does not treat the position as a conflict with itself', async () => {
      prisma.position.findUnique.mockResolvedValue(POSITION);
      prisma.position.findMany.mockResolvedValue([]);
      prisma.position.update.mockResolvedValue(POSITION);

      await service.update('pos-1', { name: 'Developer' });

      expect(prisma.position.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ NOT: { id: 'pos-1' } }) as unknown,
        }),
      );
    });

    it('skips the uniqueness query when neither code nor name changes', async () => {
      prisma.position.findUnique.mockResolvedValue(POSITION);
      prisma.position.update.mockResolvedValue(POSITION);

      await service.update('pos-1', { isActive: false });

      expect(prisma.position.findMany).not.toHaveBeenCalled();
    });

    it('leaves omitted fields undefined so Prisma keeps them', async () => {
      prisma.position.findUnique.mockResolvedValue(POSITION);
      prisma.position.findMany.mockResolvedValue([]);
      prisma.position.update.mockResolvedValue(POSITION);

      await service.update('pos-1', { name: 'Senior Developer' });

      expect(prisma.position.update).toHaveBeenCalledWith({
        where: { id: 'pos-1' },
        data: {
          code: undefined,
          name: 'Senior Developer',
          description: undefined,
          isActive: undefined,
        },
      });
    });

    it('rejects a name already held by another position', async () => {
      prisma.position.findUnique.mockResolvedValue(POSITION);
      prisma.position.findMany.mockResolvedValue([
        { code: 'QA', name: 'QA Engineer' },
      ]);

      await expect(
        service.update('pos-1', { name: 'QA Engineer' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.position.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes a position nobody is assigned to', async () => {
      prisma.position.findUnique.mockResolvedValue({
        _count: { employees: 0 },
      });

      await expect(service.remove('pos-1')).resolves.toBeUndefined();
      expect(prisma.position.delete).toHaveBeenCalledWith({
        where: { id: 'pos-1' },
      });
    });

    it('throws 404 for an unknown id', async () => {
      prisma.position.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.position.delete).not.toHaveBeenCalled();
    });

    it('throws 409 while employees still reference it', async () => {
      prisma.position.findUnique.mockResolvedValue({
        _count: { employees: 4 },
      });

      await expect(service.remove('pos-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.position.delete).not.toHaveBeenCalled();
    });
  });
});
