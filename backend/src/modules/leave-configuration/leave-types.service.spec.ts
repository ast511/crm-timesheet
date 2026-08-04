import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SortOrder } from '../../common/enums/sort-order.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { LeaveTypeQueryDto } from './leave-types/dto/leave-type-query.dto';
import { LeaveTypeRow } from './leave-types/entities/leave-type.entity';
import { LeaveTypesService } from './leave-types.service';

/** A row as PostgreSQL returns it — `Date` objects, not strings. */
const LEAVE_TYPE: LeaveTypeRow = {
  id: 'lvt-1',
  code: 'ANNUAL',
  label: 'Annual Leave',
  icon: 'umbrella-beach',
  color: '#3B82F6',
  description: 'Paid days off agreed in advance.',
  defaultAllocatedDays: 21,
  requiresApproval: true,
  isPaid: true,
  isActive: true,
  createdAt: new Date('2026-08-04T10:00:00.000Z'),
  updatedAt: new Date('2026-08-04T11:30:00.000Z'),
};

/** The same row once mapped for the API. */
const LEAVE_TYPE_ENTITY = {
  id: 'lvt-1',
  code: 'ANNUAL',
  label: 'Annual Leave',
  icon: 'umbrella-beach',
  color: '#3B82F6',
  description: 'Paid days off agreed in advance.',
  defaultAllocatedDays: 21,
  requiresApproval: true,
  isPaid: true,
  isActive: true,
  createdAt: '2026-08-04T10:00:00.000Z',
  updatedAt: '2026-08-04T11:30:00.000Z',
};

const defaultQuery = (
  overrides: Partial<LeaveTypeQueryDto> = {},
): LeaveTypeQueryDto =>
  Object.assign(new LeaveTypeQueryDto(), overrides) as LeaveTypeQueryDto;

describe('LeaveTypesService', () => {
  let service: LeaveTypesService;
  let prisma: {
    leaveType: {
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
      leaveType: {
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
        LeaveTypesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(LeaveTypesService);
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.leaveType.findMany.mockResolvedValue([LEAVE_TYPE]);
      prisma.leaveType.count.mockResolvedValue(1);
    });

    it('returns the mapped page with its metadata', async () => {
      const result = await service.findAll(defaultQuery());

      expect(result).toEqual({
        items: [LEAVE_TYPE_ENTITY],
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

      expect(prisma.leaveType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('orders by the requested column and breaks ties on id', async () => {
      await service.findAll(
        defaultQuery({
          sortBy: 'defaultAllocatedDays',
          sortOrder: SortOrder.DESC,
        }),
      );

      expect(prisma.leaveType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ defaultAllocatedDays: 'desc' }, { id: 'asc' }],
        }),
      );
    });

    it('searches code and label case-insensitively', async () => {
      await service.findAll(defaultQuery({ search: 'annual' }));

      expect(prisma.leaveType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: [
                  { code: { contains: 'annual', mode: 'insensitive' } },
                  { label: { contains: 'annual', mode: 'insensitive' } },
                ],
              },
            ],
          },
        }),
      );
    });

    /** The three filters are independent and narrow each other. */
    it('combines the boolean filters with the search term', async () => {
      await service.findAll(
        defaultQuery({ search: 'leave', isActive: true, isPaid: false }),
      );

      expect(prisma.leaveType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              expect.objectContaining({ OR: expect.any(Array) }),
              { isActive: true },
              { isPaid: false },
            ],
          },
        }),
      );
    });

    it('applies no filter when nothing was asked for', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.leaveType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
      expect(prisma.leaveType.count).toHaveBeenCalledWith({ where: undefined });
    });

    /** `false` is a filter; only `undefined` means "do not filter". */
    it('treats requiresApproval=false as a filter rather than as absent', async () => {
      await service.findAll(defaultQuery({ requiresApproval: false }));

      expect(prisma.leaveType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ requiresApproval: false }] },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('maps the row it finds', async () => {
      prisma.leaveType.findUnique.mockResolvedValue(LEAVE_TYPE);

      await expect(service.findOne('lvt-1')).resolves.toEqual(
        LEAVE_TYPE_ENTITY,
      );
    });

    it('reports an unknown id as a 404', async () => {
      prisma.leaveType.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('stores a leave type whose code and label are free', async () => {
      prisma.leaveType.findMany.mockResolvedValue([]);
      prisma.leaveType.create.mockResolvedValue(LEAVE_TYPE);

      await expect(
        service.create({
          code: 'ANNUAL',
          label: 'Annual Leave',
          icon: 'umbrella-beach',
        }),
      ).resolves.toEqual(LEAVE_TYPE_ENTITY);
    });

    it('rejects a duplicate code with a 409 naming it', async () => {
      prisma.leaveType.findMany.mockResolvedValue([
        { code: 'ANNUAL', label: 'Something Else' },
      ]);

      await expect(
        service.create({
          code: 'ANNUAL',
          label: 'Annual Leave',
          icon: 'umbrella-beach',
        }),
      ).rejects.toMatchObject({
        response: {
          message: ['A leave type with code "ANNUAL" already exists'],
        },
      });
    });

    /** Both problems are reported at once, so a form can mark both inputs. */
    it('reports a duplicate code and label together', async () => {
      prisma.leaveType.findMany.mockResolvedValue([
        { code: 'ANNUAL', label: 'Annual Leave' },
      ]);

      await expect(
        service.create({
          code: 'ANNUAL',
          label: 'Annual Leave',
          icon: 'umbrella-beach',
        }),
      ).rejects.toMatchObject({
        response: {
          message: [
            'A leave type with code "ANNUAL" already exists',
            'A leave type with label "Annual Leave" already exists',
          ],
        },
      });
    });

    /** A stored `Annual Leave` and a submitted `annual leave` are one type. */
    it('compares the unique fields case-insensitively', async () => {
      prisma.leaveType.findMany.mockResolvedValue([]);
      prisma.leaveType.create.mockResolvedValue(LEAVE_TYPE);

      await service.create({
        code: 'ANNUAL',
        label: 'Annual Leave',
        icon: 'umbrella-beach',
      });

      expect(prisma.leaveType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { code: { equals: 'ANNUAL', mode: 'insensitive' } },
              { label: { equals: 'Annual Leave', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });
  });

  describe('update', () => {
    it('reports a missing id before it looks for a conflict', async () => {
      prisma.leaveType.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nope', { code: 'ANNUAL' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.leaveType.findMany).not.toHaveBeenCalled();
    });

    /** A row must not conflict with the code it already owns. */
    it('excludes the row being patched from the duplicate check', async () => {
      prisma.leaveType.findUnique.mockResolvedValue(LEAVE_TYPE);
      prisma.leaveType.findMany.mockResolvedValue([]);
      prisma.leaveType.update.mockResolvedValue(LEAVE_TYPE);

      await service.update('lvt-1', { code: 'ANNUAL' });

      expect(prisma.leaveType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ NOT: { id: 'lvt-1' } }),
        }),
      );
    });

    it('skips the duplicate query when neither unique field was sent', async () => {
      prisma.leaveType.findUnique.mockResolvedValue(LEAVE_TYPE);
      prisma.leaveType.update.mockResolvedValue(LEAVE_TYPE);

      await service.update('lvt-1', { isActive: false });

      expect(prisma.leaveType.findMany).not.toHaveBeenCalled();
    });

    /** `null` clears the column; `undefined` leaves it alone. */
    it('passes an explicit null through to the nullable columns', async () => {
      prisma.leaveType.findUnique.mockResolvedValue(LEAVE_TYPE);
      prisma.leaveType.update.mockResolvedValue(LEAVE_TYPE);

      await service.update('lvt-1', {
        defaultAllocatedDays: null,
        color: null,
      });

      expect(prisma.leaveType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            defaultAllocatedDays: null,
            color: null,
            label: undefined,
          }),
        }),
      );
    });

    it('rejects a label another leave type already holds', async () => {
      prisma.leaveType.findUnique.mockResolvedValue(LEAVE_TYPE);
      prisma.leaveType.findMany.mockResolvedValue([
        { code: 'MEDICAL', label: 'Annual Leave' },
      ]);

      await expect(
        service.update('lvt-1', { label: 'Annual Leave' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it('deletes a leave type that exists', async () => {
      prisma.leaveType.findUnique.mockResolvedValue({ id: 'lvt-1' });

      await service.remove('lvt-1');

      expect(prisma.leaveType.delete).toHaveBeenCalledWith({
        where: { id: 'lvt-1' },
      });
    });

    it('reports an unknown id as a 404 and deletes nothing', async () => {
      prisma.leaveType.findUnique.mockResolvedValue(null);

      await expect(service.remove('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.leaveType.delete).not.toHaveBeenCalled();
    });
  });
});
