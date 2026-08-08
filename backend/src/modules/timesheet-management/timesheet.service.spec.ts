import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  TimesheetEntryType,
  TimesheetStatus,
  UserRole,
  Weekday,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { TimesheetQueryDto } from './dto/timesheet-query.dto';
import { TimesheetFillService } from './timesheet-fill.service';
import { TimesheetNotificationService } from './timesheet-notification.service';
import { TimesheetService } from './timesheet.service';

/**
 * The period every fixture is about.
 *
 * **Deliberately in the past**, because `openOwn` refuses a month that has not
 * happened yet and these tests run against the real clock. Anchoring the fixtures
 * to a year that is already over keeps the suite from becoming a calendar bomb:
 * a "current month" fixture passes until the month turns over.
 */
const MONTH = 3;
const YEAR = 2024;

const OWNER_EMPLOYEE_ID = 'emp-owner';

const owner: CurrentUser = {
  userId: 'usr-owner',
  employeeId: OWNER_EMPLOYEE_ID,
  role: UserRole.USER,
  administrativeAccess: false,
};

const otherEmployee: CurrentUser = {
  userId: 'usr-other',
  employeeId: 'emp-other',
  role: UserRole.USER,
  administrativeAccess: false,
};

const admin: CurrentUser = {
  userId: 'usr-admin',
  employeeId: 'emp-admin',
  role: UserRole.ADMIN,
  administrativeAccess: true,
};

/** An account with no employment record — a super-admin who administers only. */
const accountWithoutEmployee: CurrentUser = { ...admin, employeeId: null };

const EMPLOYEE = {
  id: OWNER_EMPLOYEE_ID,
  employeeCode: 'EMP-0001',
  firstName: 'Ion',
  lastName: 'Popescu',
  department: { id: 'dep-1', code: 'DEV', name: 'Development' },
  position: { id: 'pos-1', code: 'DEV-SR', name: 'Senior Developer' },
};

/** Stands in for the `Decimal` the driver returns for a `decimal` column. */
const decimal = (value: number) => ({ toNumber: () => value });

/** The columns `TIMESHEET_FACTS_SELECT` reads. */
const facts = (overrides: Record<string, unknown> = {}) => ({
  id: 'tsh-1',
  employeeId: OWNER_EMPLOYEE_ID,
  month: MONTH,
  year: YEAR,
  status: TimesheetStatus.DRAFT,
  isStale: false,
  rejectionReason: null,
  updatedAt: new Date('2026-09-20T10:00:00.000Z'),
  employee: {
    id: EMPLOYEE.id,
    employeeCode: EMPLOYEE.employeeCode,
    firstName: EMPLOYEE.firstName,
    lastName: EMPLOYEE.lastName,
  },
  ...overrides,
});

/** A row as `TIMESHEET_DETAIL_SELECT` returns it. */
const detail = (overrides: Record<string, unknown> = {}) => ({
  id: 'tsh-1',
  month: MONTH,
  year: YEAR,
  status: TimesheetStatus.DRAFT,
  submittedAt: null,
  reviewedAt: null,
  rejectionReason: null,
  isStale: false,
  employee: EMPLOYEE,
  reviewedBy: null,
  scheduleSnapshot: null,
  entries: [],
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  updatedAt: new Date('2026-09-20T10:00:00.000Z'),
  ...overrides,
});

/**
 * A row that satisfies **both** selects a staleness check passes through.
 *
 * `findOwn` reads the detail select, `refreshStaleness` reads the facts select
 * plus the entries, and `toDetail` reads the detail select again — three
 * `findUnique` calls on one mock. Rather than sequencing three
 * `mockResolvedValueOnce`s and depending on the order the service happens to make
 * them in, the fixture is the union of the three shapes and the mock answers every
 * call with it. A test that passed only because of call ordering would break the
 * next time a query moved.
 */
const stalenessRow = (overrides: Record<string, unknown> = {}) => ({
  // `facts` first: `detail` carries the richer employee — with its department and
  // position — and must win, while `facts` contributes the columns only a rule
  // reads, like `employeeId`.
  ...facts(overrides),
  ...detail(overrides),
  entries: [],
});

/** A month plan with nothing forced on it. */
const EMPTY_PLAN = {
  month: MONTH,
  year: YEAR,
  days: new Map(),
  forced: [],
  schedule: {
    workingDays: [Weekday.MONDAY],
    weekStartsOn: Weekday.MONDAY,
    standardHoursPerDay: 8,
  },
};

const defaultQuery = (overrides: Partial<TimesheetQueryDto> = {}) =>
  Object.assign(new TimesheetQueryDto(), overrides) as TimesheetQueryDto;

/** The field messages inside an exception thrown with an array payload. */
const messagesFrom = async (call: Promise<unknown>): Promise<string[]> => {
  try {
    await call;
  } catch (error) {
    const response = (error as BadRequestException).getResponse();
    const { message } = response as { message: string | string[] };

    return Array.isArray(message) ? message : [message];
  }

  throw new Error('Expected the call to reject, but it resolved');
};

describe('TimesheetService', () => {
  let service: TimesheetService;
  let prisma: {
    timesheet: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    timesheetEntry: {
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      createMany: jest.Mock;
      groupBy: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let fill: {
    planMonth: jest.Mock;
    prepopulate: jest.Mock;
    assertEntriesAreValid: jest.Mock;
    buildScheduleSnapshot: jest.Mock;
  };
  let notifications: {
    announceSubmitted: jest.Mock;
    announceApproved: jest.Mock;
    announceRejected: jest.Mock;
    announceStale: jest.Mock;
  };

  /** The `data` the last `updateMany` was handed. */
  const transitionData = () =>
    (
      prisma.timesheet.updateMany.mock.calls.at(-1)?.[0] as {
        data: Record<string, unknown>;
      }
    ).data;

  /** The `where` the last `updateMany` was handed. */
  const transitionWhere = () =>
    (
      prisma.timesheet.updateMany.mock.calls.at(-1)?.[0] as {
        where: Record<string, unknown>;
      }
    ).where;

  beforeEach(async () => {
    prisma = {
      timesheet: {
        findUnique: jest.fn().mockResolvedValue(detail()),
        findMany: jest.fn().mockResolvedValue([detail()]),
        count: jest.fn().mockResolvedValue(1),
        upsert: jest.fn().mockResolvedValue({ id: 'tsh-1' }),
        update: jest.fn().mockResolvedValue(detail()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        delete: jest.fn().mockResolvedValue(detail()),
      },
      timesheetEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((argument: unknown) =>
        typeof argument === 'function'
          ? (argument as (tx: unknown) => unknown)(prisma)
          : Promise.all(argument as Promise<unknown>[]),
      ),
    };
    fill = {
      planMonth: jest.fn().mockResolvedValue(EMPTY_PLAN),
      prepopulate: jest.fn().mockReturnValue([]),
      assertEntriesAreValid: jest.fn().mockResolvedValue([]),
      buildScheduleSnapshot: jest.fn().mockReturnValue({ frozen: true }),
    };
    notifications = {
      announceSubmitted: jest.fn().mockResolvedValue(undefined),
      announceApproved: jest.fn().mockResolvedValue(undefined),
      announceRejected: jest.fn().mockResolvedValue(undefined),
      announceStale: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TimesheetService,
        { provide: PrismaService, useValue: prisma },
        { provide: TimesheetFillService, useValue: fill },
        { provide: TimesheetNotificationService, useValue: notifications },
      ],
    }).compile();

    service = moduleRef.get(TimesheetService);
  });

  describe('opening a month', () => {
    it('creates a draft pre-populated with the leave and holidays', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(null);
      fill.prepopulate.mockReturnValue([
        {
          date: new Date('2026-09-07T00:00:00.000Z'),
          type: TimesheetEntryType.HOLIDAY,
          hours: 8,
          projectId: null,
          leaveRequestId: null,
          description: 'Company Day',
        },
      ]);

      await service.openOwn(owner, { month: MONTH, year: YEAR });

      const { create } = prisma.timesheet.upsert.mock.calls[0][0] as {
        create: { entries: { create: unknown[] } };
      };

      expect(create.entries.create).toHaveLength(1);
    });

    // The unique constraint is what makes this a guarantee rather than a hope.
    it('is idempotent: a second call returns the same timesheet', async () => {
      await service.openOwn(owner, { month: MONTH, year: YEAR });

      expect(prisma.timesheet.upsert).not.toHaveBeenCalled();
      expect(fill.prepopulate).not.toHaveBeenCalled();
    });

    it('refuses a month that has not happened yet', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(null);

      const problems = await messagesFrom(
        service.openOwn(owner, { month: 12, year: 2999 }),
      );

      expect(problems[0]).toContain('only the current month and past months');
    });

    /**
     * A `403` since Feature 032, where this was a `400` naming `x-employee-id`.
     * The condition is unchanged — a super-admin created to administer the
     * system has no employment record — but the caller no longer *sends* an
     * employee id, so the refusal is about what their account is rather than
     * about what their request left out.
     */
    it('refuses an account with no employment record', async () => {
      await expect(
        service.openOwn(accountWithoutEmployee, { month: MONTH, year: YEAR }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.openOwn(accountWithoutEmployee, { month: MONTH, year: YEAR }),
      ).rejects.toThrow(/employment record/);
    });
  });

  describe('editing the entries', () => {
    it('replaces the whole set in one transaction and lowers the stale flag', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(facts());
      fill.assertEntriesAreValid.mockResolvedValue([
        {
          date: new Date('2026-09-01T00:00:00.000Z'),
          type: TimesheetEntryType.WORK,
          hours: 8,
          projectId: 'prj-1',
          leaveRequestId: null,
          description: null,
        },
      ]);

      await service.setOwnEntries(owner, 'tsh-1', { entries: [] });

      expect(prisma.timesheetEntry.deleteMany).toHaveBeenCalledWith({
        where: { timesheetId: 'tsh-1' },
      });
      expect(prisma.timesheetEntry.createMany).toHaveBeenCalled();
      expect(prisma.timesheet.update).toHaveBeenCalledWith({
        where: { id: 'tsh-1' },
        data: { isStale: false },
      });
    });

    it('is allowed on a rejected month', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(
        facts({ status: TimesheetStatus.REJECTED }),
      );

      await expect(
        service.setOwnEntries(owner, 'tsh-1', { entries: [] }),
      ).resolves.toBeDefined();
    });

    it('refuses an edit while the month is under review', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(
        facts({ status: TimesheetStatus.SUBMITTED }),
      );

      await expect(
        service.setOwnEntries(owner, 'tsh-1', { entries: [] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses an edit to an approved month, saying it is immutable', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(
        facts({ status: TimesheetStatus.APPROVED }),
      );

      await expect(
        service.setOwnEntries(owner, 'tsh-1', { entries: [] }),
      ).rejects.toThrow(/immutable/);
    });

    // Ownership is domain logic: a timesheet is filled by the person it is about.
    it('refuses somebody else’s timesheet', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(facts());

      await expect(
        service.setOwnEntries(otherEmployee, 'tsh-1', { entries: [] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('submitting', () => {
    it('moves a draft to submitted and tells the administrators once', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(facts());

      await service.submitOwn(owner, 'tsh-1');

      expect(transitionData()).toMatchObject({
        status: TimesheetStatus.SUBMITTED,
        isStale: false,
      });
      expect(notifications.announceSubmitted).toHaveBeenCalledTimes(1);
    });

    it('re-validates the stored entries against the calendar as it is now', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(facts());

      await service.submitOwn(owner, 'tsh-1');

      expect(fill.assertEntriesAreValid).toHaveBeenCalled();
    });

    it('resubmits a rejected month through the same transition', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(
        facts({ status: TimesheetStatus.REJECTED }),
      );

      await service.submitOwn(owner, 'tsh-1');

      expect(transitionData()).toMatchObject({
        status: TimesheetStatus.SUBMITTED,
      });
    });

    /**
     * The guard is in the `WHERE`, so a second submit moves no row — which is what
     * makes "a double submit does not produce two notifications" a property of the
     * database rather than of a check somebody remembered to write.
     */
    it('announces nothing when the transition moved no row', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(facts());
      prisma.timesheet.updateMany.mockResolvedValue({ count: 0 });

      await service.submitOwn(owner, 'tsh-1');

      expect(notifications.announceSubmitted).not.toHaveBeenCalled();
    });

    it('guards the transition on the statuses it may come from', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(facts());

      await service.submitOwn(owner, 'tsh-1');

      expect(transitionWhere()).toEqual({
        id: 'tsh-1',
        status: {
          in: [TimesheetStatus.DRAFT, TimesheetStatus.REJECTED],
        },
      });
    });

    it('refuses to submit an already submitted month', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(
        facts({ status: TimesheetStatus.SUBMITTED }),
      );

      await expect(service.submitOwn(owner, 'tsh-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses somebody else’s timesheet', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(facts());

      await expect(
        service.submitOwn(otherEmployee, 'tsh-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('approving', () => {
    const submitted = () => facts({ status: TimesheetStatus.SUBMITTED });

    it('moves a submitted month to approved, freezing the schedule it was judged by', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(submitted());

      await service.approve(admin, 'tsh-1');

      expect(transitionData()).toMatchObject({
        status: TimesheetStatus.APPROVED,
        reviewedByEmployeeId: 'emp-admin',
        scheduleSnapshot: { frozen: true },
        isStale: false,
      });
      expect(notifications.announceApproved).toHaveBeenCalledTimes(1);
    });

    // Two administrators acting at once must not produce a month that is both
    // approved and rejected. The guard is in the WHERE of the update itself.
    it('guards the transition on SUBMITTED inside the update', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(submitted());

      await service.approve(admin, 'tsh-1');

      expect(transitionWhere()).toEqual({
        id: 'tsh-1',
        status: TimesheetStatus.SUBMITTED,
      });
    });

    it('answers 409 when somebody else reviewed it a moment earlier', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(submitted());
      prisma.timesheet.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve(admin, 'tsh-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(notifications.announceApproved).not.toHaveBeenCalled();
    });

    it('refuses to approve an already approved month', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(
        facts({ status: TimesheetStatus.APPROVED }),
      );

      await expect(service.approve(admin, 'tsh-1')).rejects.toThrow(
        /immutable/,
      );
    });

    it('refuses to approve a draft nobody has submitted', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(facts());

      await expect(service.approve(admin, 'tsh-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses a caller who is not an administrator', async () => {
      await expect(service.approve(owner, 'tsh-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('rejecting', () => {
    const submitted = () => facts({ status: TimesheetStatus.SUBMITTED });

    it('moves a submitted month to rejected and passes the reason on', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(submitted());

      await service.reject(admin, 'tsh-1', {
        rejectionReason: 'The 14th is missing.',
      });

      expect(transitionData()).toMatchObject({
        status: TimesheetStatus.REJECTED,
        rejectionReason: 'The 14th is missing.',
      });
      expect(notifications.announceRejected).toHaveBeenCalledWith(
        expect.objectContaining({ month: MONTH, year: YEAR }),
        'The 14th is missing.',
      );
    });

    it('requires a reason', async () => {
      const problems = await messagesFrom(
        service.reject(admin, 'tsh-1', {
          rejectionReason: null as unknown as string,
        }),
      );

      expect(problems[0]).toContain('rejectionReason is required');
      expect(prisma.timesheet.updateMany).not.toHaveBeenCalled();
    });

    it('captures no snapshot: the month is going back to be changed', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(submitted());

      await service.reject(admin, 'tsh-1', { rejectionReason: 'Incomplete.' });

      expect(transitionData()).not.toHaveProperty('scheduleSnapshot');
      expect(fill.buildScheduleSnapshot).not.toHaveBeenCalled();
    });

    it('answers 409 when somebody else reviewed it a moment earlier', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(submitted());
      prisma.timesheet.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.reject(admin, 'tsh-1', { rejectionReason: 'Incomplete.' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(notifications.announceRejected).not.toHaveBeenCalled();
    });

    it('refuses a caller who is not an administrator', async () => {
      await expect(
        service.reject(owner, 'tsh-1', { rejectionReason: 'No.' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('deleting', () => {
    it('removes a month that was never approved', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(
        facts({ status: TimesheetStatus.SUBMITTED }),
      );

      await service.remove(admin, 'tsh-1');

      expect(prisma.timesheet.delete).toHaveBeenCalledWith({
        where: { id: 'tsh-1' },
      });
    });

    it('refuses to delete an approved month', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(
        facts({ status: TimesheetStatus.APPROVED }),
      );

      await expect(service.remove(admin, 'tsh-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.timesheet.delete).not.toHaveBeenCalled();
    });

    it('refuses a caller who is not an administrator', async () => {
      await expect(service.remove(owner, 'tsh-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('the hour aggregates', () => {
    it('splits the hours by category and totals them, in one groupBy', async () => {
      prisma.timesheetEntry.groupBy.mockResolvedValue([
        {
          timesheetId: 'tsh-1',
          type: TimesheetEntryType.WORK,
          _sum: { hours: decimal(120) },
        },
        {
          timesheetId: 'tsh-1',
          type: TimesheetEntryType.LEAVE,
          _sum: { hours: decimal(16) },
        },
        {
          timesheetId: 'tsh-1',
          type: TimesheetEntryType.HOLIDAY,
          _sum: { hours: decimal(8) },
        },
      ]);

      const timesheet = await service.findOwn(owner, {
        month: MONTH,
        year: YEAR,
      });

      expect(timesheet).toMatchObject({
        workedHours: 120,
        leaveHours: 16,
        holidayHours: 8,
        totalHours: 144,
      });
      expect(prisma.timesheetEntry.groupBy).toHaveBeenCalledTimes(1);
    });

    it('reports zeros for a month with no entries', async () => {
      const timesheet = await service.findOwn(owner, {
        month: MONTH,
        year: YEAR,
      });

      expect(timesheet).toMatchObject({
        workedHours: 0,
        leaveHours: 0,
        holidayHours: 0,
        totalHours: 0,
      });
    });
  });

  describe('the administrative list', () => {
    it('never returns drafts, whatever was asked for', async () => {
      await service.findAll(admin, defaultQuery());

      const { where } = prisma.timesheet.findMany.mock.calls[0][0] as {
        where: { AND: { status?: { in: string[] } }[] };
      };

      expect(where.AND[0].status?.in).toEqual([
        TimesheetStatus.SUBMITTED,
        TimesheetStatus.APPROVED,
        TimesheetStatus.REJECTED,
      ]);
    });

    it('intersects ?status=DRAFT to nothing rather than failing', async () => {
      await service.findAll(
        admin,
        defaultQuery({ status: TimesheetStatus.DRAFT }),
      );

      const { where } = prisma.timesheet.findMany.mock.calls[0][0] as {
        where: { AND: { status?: { in: string[] } }[] };
      };

      expect(where.AND[0].status?.in).toEqual([]);
    });

    it('reads the page and the total under one snapshot', async () => {
      await service.findAll(admin, defaultQuery());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('orders by the employee’s surname when asked, with an id tie-break', async () => {
      await service.findAll(admin, defaultQuery({ sortBy: 'employee' }));

      const { orderBy } = prisma.timesheet.findMany.mock.calls[0][0] as {
        orderBy: unknown[];
      };

      expect(orderBy).toEqual([
        { employee: { lastName: 'asc' } },
        { employee: { firstName: 'asc' } },
        { id: 'asc' },
      ]);
    });

    it('searches the employee’s name, code and position', async () => {
      await service.findAll(admin, defaultQuery({ search: 'pop' }));

      const { where } = prisma.timesheet.findMany.mock.calls[0][0] as {
        where: { AND: Record<string, unknown>[] };
      };

      expect(JSON.stringify(where.AND)).toContain('position');
      expect(JSON.stringify(where.AND)).toContain('employeeCode');
    });

    it('refuses a caller who is not an administrator', async () => {
      await expect(
        service.findAll(owner, defaultQuery()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('visibility', () => {
    it('answers 404 for a draft an administrator addressed by id', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(facts());

      await expect(service.findOne(admin, 'tsh-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('shows a submitted month to an administrator', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(
        facts({ status: TimesheetStatus.SUBMITTED }),
      );

      await expect(service.findOne(admin, 'tsh-1')).resolves.toBeDefined();
    });

    it('answers 404 when the caller has not opened the month yet', async () => {
      prisma.timesheet.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.findOwn(owner, { month: MONTH, year: YEAR }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('retroactive dependency changes', () => {
    /**
     * A leave approved after the month was filled changes what the engine would
     * produce, so the stored lines and the computed ones no longer agree.
     */
    it('marks a draft stale and notifies its owner once', async () => {
      prisma.timesheet.findUnique.mockResolvedValue(stalenessRow());
      fill.planMonth.mockResolvedValue({
        ...EMPTY_PLAN,
        forced: [
          {
            dateKey: '2026-09-07',
            date: new Date('2026-09-07T00:00:00.000Z'),
            type: TimesheetEntryType.LEAVE,
            hours: 8,
            leaveRequestId: 'lvr-1',
            description: 'Annual Leave',
          },
        ],
      });

      await service.findOwn(owner, { month: MONTH, year: YEAR });

      expect(prisma.timesheet.updateMany).toHaveBeenCalledWith({
        where: { id: 'tsh-1', isStale: false },
        data: { isStale: true },
      });
      expect(notifications.announceStale).toHaveBeenCalledWith(
        expect.objectContaining({ month: MONTH, year: YEAR }),
        'an approved leave request',
      );
    });

    it('never rewrites the entries as a side effect', async () => {
      prisma.timesheet.findUnique.mockResolvedValue(stalenessRow());
      fill.planMonth.mockResolvedValue({
        ...EMPTY_PLAN,
        forced: [
          {
            dateKey: '2026-09-07',
            date: new Date('2026-09-07T00:00:00.000Z'),
            type: TimesheetEntryType.HOLIDAY,
            hours: 8,
            leaveRequestId: null,
            description: 'Company Day',
          },
        ],
      });

      await service.findOwn(owner, { month: MONTH, year: YEAR });

      expect(prisma.timesheetEntry.createMany).not.toHaveBeenCalled();
      expect(prisma.timesheetEntry.deleteMany).not.toHaveBeenCalled();
    });

    it('names a holiday as the reason when the holidays are what moved', async () => {
      prisma.timesheet.findUnique.mockResolvedValue(stalenessRow());
      fill.planMonth.mockResolvedValue({
        ...EMPTY_PLAN,
        forced: [
          {
            dateKey: '2026-09-07',
            date: new Date('2026-09-07T00:00:00.000Z'),
            type: TimesheetEntryType.HOLIDAY,
            hours: 8,
            leaveRequestId: null,
            description: 'Company Day',
          },
        ],
      });

      await service.findOwn(owner, { month: MONTH, year: YEAR });

      expect(notifications.announceStale).toHaveBeenCalledWith(
        expect.anything(),
        'a public holiday',
      );
    });

    it('leaves an approved month alone: it is frozen against its snapshot', async () => {
      prisma.timesheet.findUnique.mockResolvedValue(
        stalenessRow({ status: TimesheetStatus.APPROVED }),
      );
      fill.planMonth.mockResolvedValue({
        ...EMPTY_PLAN,
        forced: [
          {
            dateKey: '2026-09-07',
            date: new Date('2026-09-07T00:00:00.000Z'),
            type: TimesheetEntryType.HOLIDAY,
            hours: 8,
            leaveRequestId: null,
            description: 'Company Day',
          },
        ],
      });

      await service.findOwn(owner, { month: MONTH, year: YEAR });

      expect(prisma.timesheet.updateMany).not.toHaveBeenCalled();
      expect(notifications.announceStale).not.toHaveBeenCalled();
    });

    it('does not announce twice when the flag is already up', async () => {
      prisma.timesheet.findUnique.mockResolvedValue(
        stalenessRow({ isStale: true }),
      );

      await service.findOwn(owner, { month: MONTH, year: YEAR });

      expect(notifications.announceStale).not.toHaveBeenCalled();
    });

    it('says nothing when the month still agrees with its dependencies', async () => {
      prisma.timesheet.findUnique.mockResolvedValue(stalenessRow());

      await service.findOwn(owner, { month: MONTH, year: YEAR });

      expect(notifications.announceStale).not.toHaveBeenCalled();
    });

    // The advisory flag is worth strictly less than the timesheet itself.
    it('never fails the read when the dependencies cannot be resolved', async () => {
      prisma.timesheet.findUnique.mockResolvedValue(stalenessRow());
      fill.planMonth.mockRejectedValueOnce(
        new NotFoundException('The work schedule has not been configured yet.'),
      );

      await expect(
        service.findOwn(owner, { month: MONTH, year: YEAR }),
      ).resolves.toBeDefined();
    });
  });
});
