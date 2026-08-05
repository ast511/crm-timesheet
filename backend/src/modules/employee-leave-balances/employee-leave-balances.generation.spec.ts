import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { EmployeeService } from '../employees/employee.service';
import { LeaveTypesService } from '../leave-configuration/leave-types.service';
import { GenerateLeaveBalancesDto } from './dto/generate-leave-balances.dto';
import { EmployeeLeaveBalancesService } from './employee-leave-balances.service';

/**
 * Feature 024's generation, tested on its own rather than inside the CRUD spec.
 *
 * It earns a separate file because it needs a different world: a `$transaction`
 * that takes a callback rather than an array, a `createMany`, and two collaborator
 * methods the CRUD paths never call. Folding it in would have meant one
 * `beforeEach` serving two shapes, which is how a mock ends up describing
 * neither.
 *
 * Everything here is about arithmetic and planning, so nothing reaches a
 * database: the point of each test is *what would be written*, which is exactly
 * what the mocks capture.
 */

/** Somebody who has been with the company for years — no pro-rata anywhere. */
const VETERAN = {
  id: 'emp-1',
  employeeCode: 'EMP-0001',
  firstName: 'Ion',
  lastName: 'Popescu',
  hireDate: new Date('2020-03-01T00:00:00.000Z'),
};

const SECOND_VETERAN = {
  id: 'emp-2',
  employeeCode: 'EMP-0002',
  firstName: 'Maria',
  lastName: 'Ionescu',
  hireDate: new Date('2019-11-15T00:00:00.000Z'),
};

/** Annual leave: carries over, but never more than five days. */
const ANNUAL = {
  id: 'lvt-annual',
  code: 'ANNUAL',
  defaultAllocatedDays: 21,
  allowsCarryOver: true,
  maxCarryOverDays: 5,
  isActive: true,
};

/** Medical leave: granted against a certificate, so it carries nothing over. */
const SICK = {
  id: 'lvt-sick',
  code: 'SICK_LEAVE',
  defaultAllocatedDays: 180,
  allowsCarryOver: false,
  maxCarryOverDays: null,
  isActive: true,
};

/** A previous-year row, with the four numbers the expiry planner reads. */
const previousYearBalance = (
  overrides: Partial<{
    id: string;
    employeeId: string;
    leaveTypeId: string;
    year: number;
    allocatedDays: number;
    carriedOverDays: number;
    usedDays: number;
    expiredDays: number;
  }> = {},
) => ({
  id: 'elb-2026-annual',
  employeeId: VETERAN.id,
  leaveTypeId: ANNUAL.id,
  year: 2026,
  allocatedDays: 21,
  carriedOverDays: 0,
  usedDays: 4,
  expiredDays: 0,
  ...overrides,
});

const request = (
  overrides: Partial<GenerateLeaveBalancesDto> = {},
): GenerateLeaveBalancesDto =>
  ({ year: 2027, ...overrides }) as GenerateLeaveBalancesDto;

describe('EmployeeLeaveBalancesService.generate', () => {
  let service: EmployeeLeaveBalancesService;
  let tx: {
    employeeLeaveBalance: { createMany: jest.Mock; update: jest.Mock };
  };
  let prisma: {
    employeeLeaveBalance: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let employees: { findGenerationCandidates: jest.Mock };
  let leaveTypes: { findGenerationPolicies: jest.Mock };

  /** The rows `createMany` was asked to insert, in the order they were planned. */
  const created = (): Record<string, unknown>[] => {
    const [{ data }] = tx.employeeLeaveBalance.createMany.mock.calls[0] as [
      { data: Record<string, unknown>[] },
    ];

    return data;
  };

  beforeEach(async () => {
    tx = {
      employeeLeaveBalance: {
        createMany: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown[] }) => ({
            count: data.length,
          })),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    prisma = {
      employeeLeaveBalance: { findMany: jest.fn().mockResolvedValue([]) },
      // The callback form: the real client hands the work a transaction-bound
      // client, and so does this.
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };

    employees = {
      findGenerationCandidates: jest.fn().mockResolvedValue([VETERAN]),
    };
    leaveTypes = {
      findGenerationPolicies: jest.fn().mockResolvedValue([ANNUAL]),
    };

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

  describe('creating the year', () => {
    it('writes one balance per employee per leave type', async () => {
      employees.findGenerationCandidates.mockResolvedValue([
        VETERAN,
        SECOND_VETERAN,
      ]);
      leaveTypes.findGenerationPolicies.mockResolvedValue([ANNUAL, SICK]);

      const report = await service.generate(request());

      expect(report.created).toBe(4);
      expect(created()).toHaveLength(4);
    });

    it('seeds the allocation from the leave type default', async () => {
      await service.generate(request());

      expect(created()[0]).toMatchObject({
        employeeId: VETERAN.id,
        leaveTypeId: ANNUAL.id,
        year: 2027,
        allocatedDays: 21,
      });
    });

    /**
     * The decision the whole carry-over design rests on. Days that survive a
     * year-end stay in the year they belong to, where consumption already reaches
     * them; writing them here as well would let the employee spend each twice.
     */
    it('never writes carriedOverDays', async () => {
      prisma.employeeLeaveBalance.findMany.mockResolvedValue([
        previousYearBalance({ usedDays: 0 }),
      ]);

      await service.generate(request());

      expect(created()[0]).not.toHaveProperty('carriedOverDays');
    });

    it('leaves a balance that already exists untouched', async () => {
      prisma.employeeLeaveBalance.findMany.mockResolvedValue([
        { ...previousYearBalance(), id: 'elb-2027', year: 2027 },
      ]);

      const report = await service.generate(request());

      expect(report).toMatchObject({ created: 0, skipped: 1 });
      expect(created()).toHaveLength(0);
    });

    /** Re-running in January, once three more people have been hired. */
    it('creates only what is missing on a second run', async () => {
      employees.findGenerationCandidates.mockResolvedValue([
        VETERAN,
        SECOND_VETERAN,
      ]);
      prisma.employeeLeaveBalance.findMany.mockResolvedValue([
        {
          ...previousYearBalance(),
          id: 'elb-2027',
          year: 2027,
          employeeId: VETERAN.id,
        },
      ]);

      const report = await service.generate(request());

      expect(report).toMatchObject({ created: 1, skipped: 1 });
      expect(created()[0]).toMatchObject({ employeeId: SECOND_VETERAN.id });
    });
  });

  describe('pro-rata for a first year', () => {
    /** Hired 15 July: July through December is six months of twenty-one days. */
    it('reduces the allocation to the months that will be worked', async () => {
      employees.findGenerationCandidates.mockResolvedValue([
        { ...VETERAN, hireDate: new Date('2027-07-15T00:00:00.000Z') },
      ]);

      await service.generate(request());

      expect(created()[0]).toMatchObject({ allocatedDays: 11 });
    });

    it('gives a January hire the whole year', async () => {
      employees.findGenerationCandidates.mockResolvedValue([
        { ...VETERAN, hireDate: new Date('2027-01-04T00:00:00.000Z') },
      ]);

      await service.generate(request());

      expect(created()[0]).toMatchObject({ allocatedDays: 21 });
    });

    it('applies only in the year of hire, never after it', async () => {
      employees.findGenerationCandidates.mockResolvedValue([
        { ...VETERAN, hireDate: new Date('2026-07-15T00:00:00.000Z') },
      ]);

      await service.generate(request());

      expect(created()[0]).toMatchObject({ allocatedDays: 21 });
    });

    it('skips somebody who has not been hired yet, and says so', async () => {
      employees.findGenerationCandidates.mockResolvedValue([
        { ...VETERAN, hireDate: new Date('2028-02-01T00:00:00.000Z') },
      ]);

      const report = await service.generate(request());

      expect(report.created).toBe(0);
      expect(report.warnings).toEqual([
        '1 employee(s) are hired after 2027 and were skipped',
      ]);
    });
  });

  describe('closing the previous year', () => {
    it('expires the remainder above the cap', async () => {
      // 21 allocated, 4 used, 17 remaining, 5 may survive: 12 expire.
      prisma.employeeLeaveBalance.findMany.mockResolvedValue([
        previousYearBalance(),
      ]);

      const report = await service.generate(request());

      expect(report).toMatchObject({
        expiredFromPreviousYear: 12,
        expiredBalances: 1,
      });
      expect(tx.employeeLeaveBalance.update).toHaveBeenCalledWith({
        where: { id: 'elb-2026-annual' },
        data: { expiredDays: { increment: 12 } },
      });
    });

    it('expires nothing when the remainder is under the cap', async () => {
      prisma.employeeLeaveBalance.findMany.mockResolvedValue([
        previousYearBalance({ usedDays: 18 }),
      ]);

      const report = await service.generate(request());

      expect(report.expiredFromPreviousYear).toBe(0);
      expect(tx.employeeLeaveBalance.update).not.toHaveBeenCalled();
    });

    it('expires the whole remainder when the type carries nothing over', async () => {
      leaveTypes.findGenerationPolicies.mockResolvedValue([SICK]);
      prisma.employeeLeaveBalance.findMany.mockResolvedValue([
        previousYearBalance({ leaveTypeId: SICK.id, allocatedDays: 180 }),
      ]);

      const report = await service.generate(request());

      expect(report.expiredFromPreviousYear).toBe(176);
    });

    it('expires nothing when the type has no ceiling', async () => {
      leaveTypes.findGenerationPolicies.mockResolvedValue([
        { ...ANNUAL, maxCarryOverDays: null },
      ]);
      prisma.employeeLeaveBalance.findMany.mockResolvedValue([
        previousYearBalance(),
      ]);

      const report = await service.generate(request());

      expect(report.expiredFromPreviousYear).toBe(0);
    });

    /**
     * The guard that stops a negative expiry, which would *add* days back to
     * somebody who had already taken more than they held.
     */
    it('leaves an overdrawn balance alone', async () => {
      leaveTypes.findGenerationPolicies.mockResolvedValue([SICK]);
      prisma.employeeLeaveBalance.findMany.mockResolvedValue([
        previousYearBalance({
          leaveTypeId: SICK.id,
          allocatedDays: 5,
          usedDays: 8,
        }),
      ]);

      const report = await service.generate(request());

      expect(report.expiredFromPreviousYear).toBe(0);
      expect(tx.employeeLeaveBalance.update).not.toHaveBeenCalled();
    });

    /** What makes the endpoint safe to run twice: the second run finds nothing. */
    it('takes nothing more from a year it has already capped', async () => {
      prisma.employeeLeaveBalance.findMany.mockResolvedValue([
        previousYearBalance({ expiredDays: 12 }),
      ]);

      const report = await service.generate(request());

      expect(report.expiredFromPreviousYear).toBe(0);
    });

    it('ignores a previous-year balance whose type is out of scope', async () => {
      prisma.employeeLeaveBalance.findMany.mockResolvedValue([
        previousYearBalance({ leaveTypeId: 'lvt-unrelated' }),
      ]);

      const report = await service.generate(request());

      expect(report.expiredFromPreviousYear).toBe(0);
    });
  });

  describe('leave types it cannot allocate from', () => {
    /**
     * The warning the feature exists for: this is the state that produced
     * "0 day(s) available" on a request nobody could explain.
     */
    it('warns when a type has no defaultAllocatedDays, and creates nothing for it', async () => {
      leaveTypes.findGenerationPolicies.mockResolvedValue([
        ANNUAL,
        { ...SICK, defaultAllocatedDays: null },
      ]);

      const report = await service.generate(request());

      expect(report.created).toBe(1);
      expect(report.warnings).toEqual([
        'Leave type SICK_LEAVE has no defaultAllocatedDays; 1 employee(s) were not given a balance for it',
      ]);
    });

    it('skips a retired type in silence when it was not asked for', async () => {
      leaveTypes.findGenerationPolicies.mockResolvedValue([
        ANNUAL,
        { ...SICK, isActive: false },
      ]);

      const report = await service.generate(request());

      expect(report.created).toBe(1);
      expect(report.warnings).toEqual([]);
    });

    it('warns about a retired type that was named explicitly', async () => {
      leaveTypes.findGenerationPolicies.mockResolvedValue([
        { ...SICK, isActive: false },
      ]);

      const report = await service.generate(
        request({ leaveTypeIds: [SICK.id] }),
      );

      expect(report.warnings).toEqual([
        'Leave type SICK_LEAVE has been retired and was skipped',
      ]);
    });
  });

  describe('ids that name nothing', () => {
    it('warns about an unknown employee without losing the run', async () => {
      employees.findGenerationCandidates.mockResolvedValue([VETERAN]);

      const report = await service.generate(
        request({ employeeIds: [VETERAN.id, 'emp-gone'] }),
      );

      expect(report.created).toBe(1);
      expect(report.warnings).toEqual([
        'Employee emp-gone does not exist or has been terminated, and was skipped',
      ]);
    });

    it('warns about an unknown leave type', async () => {
      const report = await service.generate(
        request({ leaveTypeIds: [ANNUAL.id, 'lvt-gone'] }),
      );

      expect(report.warnings).toEqual([
        'Leave type lvt-gone does not exist, and was skipped',
      ]);
    });

    it('reports a run with nobody in scope rather than failing', async () => {
      employees.findGenerationCandidates.mockResolvedValue([]);

      const report = await service.generate(request({ employeeIds: [] }));

      expect(report).toMatchObject({ created: 0, skipped: 0 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('dryRun', () => {
    it('reports what it would do and writes nothing', async () => {
      prisma.employeeLeaveBalance.findMany.mockResolvedValue([
        previousYearBalance(),
      ]);

      const report = await service.generate(request({ dryRun: true }));

      expect(report).toMatchObject({
        created: 1,
        expiredFromPreviousYear: 12,
        dryRun: true,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('is false on a run that writes', async () => {
      await expect(service.generate(request())).resolves.toMatchObject({
        dryRun: false,
      });
    });
  });

  /**
   * Everything a run writes is one transaction: a half-opened year — some people
   * holding balances, some 2026 rows capped and others not — is the state nobody
   * could reason about and a retry could not fix.
   */
  it('writes the creations and the expiries in one transaction', async () => {
    prisma.employeeLeaveBalance.findMany.mockResolvedValue([
      previousYearBalance(),
    ]);

    await service.generate(request());

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.employeeLeaveBalance.createMany).toHaveBeenCalledTimes(1);
    expect(tx.employeeLeaveBalance.update).toHaveBeenCalledTimes(1);
  });

  /** The guard beneath the `skipped` count, for a POST that lands mid-run. */
  it('asks the database to skip duplicates it did not see', async () => {
    await service.generate(request());

    expect(tx.employeeLeaveBalance.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });
});
