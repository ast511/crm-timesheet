import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SortOrder } from '../../common/enums/sort-order.enum';
import { EmployeeStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeeService } from '../employees/employee.service';
import { LeaveTypesService } from '../leave-configuration/leave-types.service';
import { EmployeeLeaveBalanceQueryDto } from './dto/employee-leave-balance-query.dto';
import { EmployeeLeaveBalancesService } from './employee-leave-balances.service';
import { LeaveBalanceRow } from './entities/employee-leave-balance.entity';

/** A row as PostgreSQL returns it, read through the public select. */
const BALANCE: LeaveBalanceRow = {
  id: 'elb-1',
  year: 2026,
  allocatedDays: 21,
  carriedOverDays: 3,
  usedDays: 5,
  expiredDays: 0,
  notes: 'Carried three days from 2025.',
  employee: {
    id: 'emp-1',
    employeeCode: 'EMP-0001',
    firstName: 'Ion',
    lastName: 'Popescu',
    department: { id: 'dep-1', code: 'DEV', name: 'Development' },
  },
  leaveType: {
    id: 'lvt-1',
    code: 'ANNUAL',
    label: 'Annual Leave',
    icon: 'umbrella-beach',
    color: '#3B82F6',
  },
  createdAt: new Date('2026-08-04T10:00:00.000Z'),
  updatedAt: new Date('2026-08-04T11:30:00.000Z'),
};

/** The same row once mapped — note `remainingDays`, which no column holds. */
const BALANCE_ENTITY = {
  id: 'elb-1',
  employee: {
    id: 'emp-1',
    employeeCode: 'EMP-0001',
    firstName: 'Ion',
    lastName: 'Popescu',
    department: { id: 'dep-1', code: 'DEV', name: 'Development' },
  },
  leaveType: {
    id: 'lvt-1',
    code: 'ANNUAL',
    label: 'Annual Leave',
    icon: 'umbrella-beach',
    color: '#3B82F6',
  },
  year: 2026,
  allocatedDays: 21,
  carriedOverDays: 3,
  usedDays: 5,
  expiredDays: 0,
  remainingDays: 19,
  notes: 'Carried three days from 2025.',
  createdAt: '2026-08-04T10:00:00.000Z',
  updatedAt: '2026-08-04T11:30:00.000Z',
};

const CREATE_BODY = {
  employeeId: 'emp-1',
  leaveTypeId: 'lvt-1',
  year: 2026,
  allocatedDays: 21,
};

const defaultQuery = (
  overrides: Partial<EmployeeLeaveBalanceQueryDto> = {},
): EmployeeLeaveBalanceQueryDto =>
  Object.assign(
    new EmployeeLeaveBalanceQueryDto(),
    overrides,
  ) as EmployeeLeaveBalanceQueryDto;

describe('EmployeeLeaveBalancesService', () => {
  let service: EmployeeLeaveBalancesService;
  let prisma: {
    employeeLeaveBalance: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let employees: { findStatus: jest.Mock };
  let leaveTypes: { exists: jest.Mock };

  beforeEach(async () => {
    prisma = {
      employeeLeaveBalance: {
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

    employees = {
      findStatus: jest.fn().mockResolvedValue(EmployeeStatus.ACTIVE),
    };
    leaveTypes = { exists: jest.fn().mockResolvedValue(true) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeLeaveBalancesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmployeeService, useValue: employees },
        { provide: LeaveTypesService, useValue: leaveTypes },
      ],
    }).compile();

    service = moduleRef.get(EmployeeLeaveBalancesService);
  });

  describe('remainingDays', () => {
    it('is allocated + carriedOver - used', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue(BALANCE);

      const balance = await service.findOne('elb-1');

      expect(balance.remainingDays).toBe(19);
    });

    /** The three stored numbers are the truth; the fourth is a view of them. */
    it('is recomputed from whatever the row holds', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue({
        ...BALANCE,
        allocatedDays: 10,
        carriedOverDays: 0,
        usedDays: 4,
      });

      await expect(service.findOne('elb-1')).resolves.toMatchObject({
        remainingDays: 6,
      });
    });

    /**
     * Overdrawn balances are reported, not clamped: HR reducing an allocation
     * after days were taken is exactly the case somebody needs to see.
     */
    it('goes negative when more days were used than were available', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue({
        ...BALANCE,
        allocatedDays: 5,
        carriedOverDays: 0,
        usedDays: 8,
      });

      await expect(service.findOne('elb-1')).resolves.toMatchObject({
        remainingDays: -3,
      });
    });

    /** It must never be written — the column does not exist. */
    it('is not part of what create writes', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue(null);
      prisma.employeeLeaveBalance.create.mockResolvedValue(BALANCE);

      await service.create(CREATE_BODY);

      const [{ data }] = prisma.employeeLeaveBalance.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];

      expect(data).not.toHaveProperty('remainingDays');
    });

    it('is not part of what update writes', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue({ id: 'elb-1' });
      prisma.employeeLeaveBalance.update.mockResolvedValue(BALANCE);

      await service.update('elb-1', { usedDays: 7 });

      const [{ data }] = prisma.employeeLeaveBalance.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];

      expect(data).not.toHaveProperty('remainingDays');
      expect(data).toEqual({
        allocatedDays: undefined,
        carriedOverDays: undefined,
        usedDays: 7,
        notes: undefined,
      });
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.employeeLeaveBalance.findMany.mockResolvedValue([BALANCE]);
      prisma.employeeLeaveBalance.count.mockResolvedValue(1);
    });

    it('returns the mapped page with its metadata', async () => {
      const result = await service.findAll(defaultQuery());

      expect(result).toEqual({
        items: [BALANCE_ENTITY],
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

      expect(prisma.employeeLeaveBalance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    /** `employee` is not a column: it orders by surname, then given name. */
    it('orders by the employee name when asked for employee', async () => {
      await service.findAll(defaultQuery({ sortBy: 'employee' }));

      expect(prisma.employeeLeaveBalance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { employee: { lastName: 'asc' } },
            { employee: { firstName: 'asc' } },
            { id: 'asc' },
          ],
        }),
      );
    });

    it('orders by a plain column and breaks ties on id', async () => {
      await service.findAll(
        defaultQuery({ sortBy: 'year', sortOrder: SortOrder.DESC }),
      );

      expect(prisma.employeeLeaveBalance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ year: 'desc' }, { id: 'asc' }] }),
      );
    });

    it('searches the employee code and both names case-insensitively', async () => {
      await service.findAll(defaultQuery({ search: 'popescu' }));

      expect(prisma.employeeLeaveBalance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                employee: {
                  OR: [
                    {
                      employeeCode: {
                        contains: 'popescu',
                        mode: 'insensitive',
                      },
                    },
                    { firstName: { contains: 'popescu', mode: 'insensitive' } },
                    { lastName: { contains: 'popescu', mode: 'insensitive' } },
                  ],
                },
              },
            ],
          },
        }),
      );
    });

    it('filters by department through the employee', async () => {
      await service.findAll(defaultQuery({ departmentId: 'dep-1' }));

      expect(prisma.employeeLeaveBalance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ employee: { departmentId: 'dep-1' } }] },
        }),
      );
    });

    it('combines every filter with the search term', async () => {
      await service.findAll(
        defaultQuery({
          search: 'ion',
          year: 2026,
          leaveTypeId: 'lvt-1',
          departmentId: 'dep-1',
        }),
      );

      expect(prisma.employeeLeaveBalance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              expect.objectContaining({ employee: expect.any(Object) }),
              { year: 2026 },
              { leaveTypeId: 'lvt-1' },
              { employee: { departmentId: 'dep-1' } },
            ],
          },
        }),
      );
    });

    /** The rows and the count must agree, or the total describes another page. */
    it('applies no filter when nothing was asked for', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.employeeLeaveBalance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
      expect(prisma.employeeLeaveBalance.count).toHaveBeenCalledWith({
        where: undefined,
      });
    });
  });

  describe('findOne', () => {
    it('maps the row it finds', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue(BALANCE);

      await expect(service.findOne('elb-1')).resolves.toEqual(BALANCE_ENTITY);
    });

    it('reports an unknown id as a 404', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('stores a balance whose relations exist and whose triple is free', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue(null);
      prisma.employeeLeaveBalance.create.mockResolvedValue(BALANCE);

      await expect(service.create(CREATE_BODY)).resolves.toEqual(
        BALANCE_ENTITY,
      );
    });

    it('confirms both relations through the owning services', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue(null);
      prisma.employeeLeaveBalance.create.mockResolvedValue(BALANCE);

      await service.create(CREATE_BODY);

      expect(employees.findStatus).toHaveBeenCalledWith('emp-1');
      expect(leaveTypes.exists).toHaveBeenCalledWith('lvt-1');
    });

    it('reports a missing employee as a 400 naming it', async () => {
      employees.findStatus.mockResolvedValue(null);

      await expect(service.create(CREATE_BODY)).rejects.toMatchObject({
        response: { message: ['Employee emp-1 does not exist'] },
      });
    });

    /** Both missing references are reported at once, so a form marks both. */
    it('reports a missing employee and leave type together', async () => {
      employees.findStatus.mockResolvedValue(null);
      leaveTypes.exists.mockResolvedValue(false);

      await expect(service.create(CREATE_BODY)).rejects.toMatchObject({
        response: {
          message: [
            'Employee emp-1 does not exist',
            'Leave type lvt-1 does not exist',
          ],
        },
      });
    });

    it('rejects a missing relation before it looks for a duplicate', async () => {
      leaveTypes.exists.mockResolvedValue(false);

      await expect(service.create(CREATE_BODY)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.employeeLeaveBalance.findUnique).not.toHaveBeenCalled();
    });

    /**
     * A leaver still had days in the year they left, so the balance has to be
     * recordable; the status is read only to confirm the person exists.
     */
    it('allocates leave to a terminated employee', async () => {
      employees.findStatus.mockResolvedValue(EmployeeStatus.TERMINATED);
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue(null);
      prisma.employeeLeaveBalance.create.mockResolvedValue(BALANCE);

      await expect(service.create(CREATE_BODY)).resolves.toEqual(
        BALANCE_ENTITY,
      );
    });

    it('checks the duplicate on the compound unique key', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue(null);
      prisma.employeeLeaveBalance.create.mockResolvedValue(BALANCE);

      await service.create(CREATE_BODY);

      expect(prisma.employeeLeaveBalance.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: 'emp-1',
              leaveTypeId: 'lvt-1',
              year: 2026,
            },
          },
        }),
      );
    });

    it('rejects a second balance for the same employee, type and year', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue({ id: 'elb-1' });

      await expect(service.create(CREATE_BODY)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.employeeLeaveBalance.create).not.toHaveBeenCalled();
    });

    /** The same person and type in another year is a different balance. */
    it('allows the same employee and type in a different year', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue(null);
      prisma.employeeLeaveBalance.create.mockResolvedValue({
        ...BALANCE,
        year: 2027,
      });

      await expect(
        service.create({ ...CREATE_BODY, year: 2027 }),
      ).resolves.toMatchObject({ year: 2027 });
    });

    /** Absent counts reach Prisma as `undefined`, so the schema's 0 applies. */
    it('leaves the defaulted counts to the schema', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue(null);
      prisma.employeeLeaveBalance.create.mockResolvedValue(BALANCE);

      await service.create(CREATE_BODY);

      expect(prisma.employeeLeaveBalance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            carriedOverDays: undefined,
            usedDays: undefined,
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('reports a missing id as a 404 and writes nothing', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nope', { allocatedDays: 25 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.employeeLeaveBalance.update).not.toHaveBeenCalled();
    });

    it('applies a partial change and returns the recomputed balance', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue({ id: 'elb-1' });
      prisma.employeeLeaveBalance.update.mockResolvedValue({
        ...BALANCE,
        allocatedDays: 25,
      });

      await expect(
        service.update('elb-1', { allocatedDays: 25 }),
      ).resolves.toMatchObject({ allocatedDays: 25, remainingDays: 23 });
    });

    /** `null` clears the note; `undefined` leaves it alone. */
    it('passes an explicit null through to notes', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue({ id: 'elb-1' });
      prisma.employeeLeaveBalance.update.mockResolvedValue(BALANCE);

      await service.update('elb-1', { notes: null });

      expect(prisma.employeeLeaveBalance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ notes: null }),
        }),
      );
    });

    /**
     * The triple is the balance's identity, so a patch can neither move it nor
     * collide with another row — which is why no relation or duplicate check
     * runs here.
     */
    it('consults neither relation service nor the duplicate check', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue({ id: 'elb-1' });
      prisma.employeeLeaveBalance.update.mockResolvedValue(BALANCE);

      await service.update('elb-1', { allocatedDays: 25 });

      expect(employees.findStatus).not.toHaveBeenCalled();
      expect(leaveTypes.exists).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes a balance that exists', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue({ id: 'elb-1' });

      await service.remove('elb-1');

      expect(prisma.employeeLeaveBalance.delete).toHaveBeenCalledWith({
        where: { id: 'elb-1' },
      });
    });

    it('reports an unknown id as a 404 and deletes nothing', async () => {
      prisma.employeeLeaveBalance.findUnique.mockResolvedValue(null);

      await expect(service.remove('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.employeeLeaveBalance.delete).not.toHaveBeenCalled();
    });
  });

  /**
   * The three methods Feature 023 needed and Feature 022 deliberately did not
   * guess at in advance. They are what makes this service the only writer of
   * `usedDays` outside its own POST and PATCH.
   */
  describe('consumption', () => {
    /** Two years, oldest first, as a leave request would draw on them. */
    const YEARS = [
      {
        id: 'elb-2025',
        year: 2025,
        allocatedDays: 21,
        carriedOverDays: 0,
        usedDays: 19,
        expiredDays: 0,
      },
      {
        id: 'elb-2026',
        year: 2026,
        allocatedDays: 21,
        carriedOverDays: 0,
        usedDays: 0,
        expiredDays: 0,
      },
    ];

    const SCOPE = {
      employeeId: 'emp-1',
      leaveTypeId: 'lvt-1',
      upToYear: 2026,
    };

    describe('findAvailable', () => {
      it('never reads a year later than the one it was given', async () => {
        prisma.employeeLeaveBalance.findMany.mockResolvedValue([]);

        await service.findAvailable(SCOPE);

        expect(prisma.employeeLeaveBalance.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              employeeId: 'emp-1',
              leaveTypeId: 'lvt-1',
              year: { lte: 2026 },
            },
            orderBy: { year: SortOrder.ASC },
          }),
        );
      });

      it('computes what is left rather than reading a column', async () => {
        prisma.employeeLeaveBalance.findMany.mockResolvedValue(YEARS);

        expect(await service.findAvailable(SCOPE)).toEqual([
          { id: 'elb-2025', year: 2025, remainingDays: 2 },
          { id: 'elb-2026', year: 2026, remainingDays: 21 },
        ]);
      });

      it('drops an exhausted year instead of returning a zero to skip', async () => {
        prisma.employeeLeaveBalance.findMany.mockResolvedValue([
          { ...YEARS[0], usedDays: 21 },
          YEARS[1],
        ]);

        const available = await service.findAvailable(SCOPE);

        expect(available.map(({ year }) => year)).toEqual([2026]);
      });

      it('drops an overdrawn year rather than letting the next one settle it', async () => {
        prisma.employeeLeaveBalance.findMany.mockResolvedValue([
          { ...YEARS[0], usedDays: 25 },
          YEARS[1],
        ]);

        expect(await service.findAvailable(SCOPE)).toEqual([
          { id: 'elb-2026', year: 2026, remainingDays: 21 },
        ]);
      });
    });

    describe('countAvailableDays', () => {
      it('sums what is left across every year in scope', async () => {
        prisma.employeeLeaveBalance.findMany.mockResolvedValue(YEARS);

        expect(await service.countAvailableDays(SCOPE)).toBe(23);
      });

      it('is zero when nothing has been allocated', async () => {
        prisma.employeeLeaveBalance.findMany.mockResolvedValue([]);

        expect(await service.countAvailableDays(SCOPE)).toBe(0);
      });
    });

    describe('consume', () => {
      const tx = () => ({
        employeeLeaveBalance: {
          findMany: prisma.employeeLeaveBalance.findMany,
          update: prisma.employeeLeaveBalance.update,
        },
      });

      it('takes the oldest year first, so carried-over days cannot lapse', async () => {
        prisma.employeeLeaveBalance.findMany.mockResolvedValue(YEARS);

        await service.consume(SCOPE, 5, tx() as never);

        expect(prisma.employeeLeaveBalance.update).toHaveBeenNthCalledWith(1, {
          where: { id: 'elb-2025' },
          data: { usedDays: { increment: 2 } },
        });
        expect(prisma.employeeLeaveBalance.update).toHaveBeenNthCalledWith(2, {
          where: { id: 'elb-2026' },
          data: { usedDays: { increment: 3 } },
        });
      });

      it('stops as soon as the request is covered', async () => {
        prisma.employeeLeaveBalance.findMany.mockResolvedValue(YEARS);

        await service.consume(SCOPE, 2, tx() as never);

        expect(prisma.employeeLeaveBalance.update).toHaveBeenCalledTimes(1);
      });

      it('refuses a request the balances cannot cover, and writes nothing', async () => {
        prisma.employeeLeaveBalance.findMany.mockResolvedValue(YEARS);

        await expect(
          service.consume(SCOPE, 24, tx() as never),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.employeeLeaveBalance.update).not.toHaveBeenCalled();
      });

      it('re-reads availability inside the transaction it was handed', async () => {
        prisma.employeeLeaveBalance.findMany.mockResolvedValue(YEARS);
        const client = tx();

        await service.consume(SCOPE, 1, client as never);

        expect(client.employeeLeaveBalance.findMany).toHaveBeenCalled();
      });
    });
  });
});
