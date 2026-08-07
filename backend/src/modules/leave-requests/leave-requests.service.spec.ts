import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { EmployeeLeaveBalancesService } from '../employee-leave-balances/employee-leave-balances.service';
import { EmployeeService } from '../employees/employee.service';
import {
  LeaveHalfDayPortion,
  LeaveRequestStatus,
  EmployeeStatus,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { LeaveTypesService } from '../leave-configuration/leave-types.service';
import {
  LeaveRequestQueryDto,
  MyLeaveRequestQueryDto,
} from './dto/leave-request-query.dto';
import { LeaveRequestsService } from './leave-requests.service';
import { WorkingDaysService } from './working-days.service';

/** Monday 7 September 2026 to Friday 11 September — five working days. */
const START = '2026-09-07';
const END = '2026-09-11';

const CREATE_BODY = {
  leaveTypeId: 'lvt-1',
  startDate: START,
  endDate: END,
  reason: 'Family trip',
  replacementEmployeeIds: ['emp-2'],
};

/** A stored request, in the shape the private facts select reads. */
const STORED = {
  id: 'lvr-1',
  employeeId: 'emp-1',
  leaveTypeId: 'lvt-1',
  startDate: new Date(`${START}T00:00:00.000Z`),
  endDate: new Date(`${END}T00:00:00.000Z`),
  status: LeaveRequestStatus.PENDING,
  // Added by Feature 030: a whole-day absence, which is what every request
  // written before the half-day columns existed is.
  isHalfDay: false,
  halfDayPortion: null,
  replacements: [{ employeeId: 'emp-2' }],
};

/** A row as the public selects return it. */
const ROW = {
  id: 'lvr-1',
  startDate: new Date(`${START}T00:00:00.000Z`),
  endDate: new Date(`${END}T00:00:00.000Z`),
  reason: 'Family trip',
  status: LeaveRequestStatus.PENDING,
  isHalfDay: false,
  halfDayPortion: null,
  processedAt: null,
  decisionReason: null,
  leaveType: {
    id: 'lvt-1',
    code: 'ANNUAL',
    label: 'Annual Leave',
    icon: 'umbrella-beach',
    color: '#3B82F6',
  },
  replacements: [
    {
      employee: {
        id: 'emp-2',
        employeeCode: 'EMP-0002',
        firstName: 'Maria',
        lastName: 'Ionescu',
      },
    },
  ],
  processedBy: null,
  employee: {
    id: 'emp-1',
    employeeCode: 'EMP-0001',
    firstName: 'Ion',
    lastName: 'Popescu',
    department: { id: 'dep-1', code: 'DEV', name: 'Development' },
  },
  createdAt: new Date('2026-08-04T10:00:00.000Z'),
  updatedAt: new Date('2026-08-04T10:00:00.000Z'),
};

/**
 * The field messages inside an exception thrown with an array payload.
 *
 * `.message` on such an exception is the generic `"Bad Request Exception"`; the
 * messages a client actually reads live in `response.message`, which is the shape
 * the global `ValidationPipe` produces and the shape this service copies so a form
 * can mark each offending field.
 */
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

describe('LeaveRequestsService', () => {
  let service: LeaveRequestsService;
  let prisma: {
    leaveRequest: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    leaveRequestReplacement: { deleteMany: jest.Mock; createMany: jest.Mock };
    employee: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let employees: { findStatus: jest.Mock };
  let leaveTypes: { findPolicy: jest.Mock };
  let balances: { countAvailableDays: jest.Mock; consume: jest.Mock };
  let workingDays: { createCalculator: jest.Mock };
  let countBetween: jest.Mock;

  beforeEach(async () => {
    prisma = {
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(ROW),
        update: jest.fn().mockResolvedValue(ROW),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      leaveRequestReplacement: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      employee: { findMany: jest.fn().mockResolvedValue([{ id: 'emp-2' }]) },
      // Serves both forms: the array batch the list endpoints use, and the
      // interactive callback the writes use.
      $transaction: jest.fn((argument: unknown) =>
        typeof argument === 'function'
          ? (argument as (tx: unknown) => Promise<unknown>)(prisma)
          : Promise.all(argument as Promise<unknown>[]),
      ),
    };

    employees = {
      findStatus: jest.fn().mockResolvedValue(EmployeeStatus.ACTIVE),
    };
    leaveTypes = {
      findPolicy: jest
        .fn()
        .mockResolvedValue({ requiresApproval: true, isActive: true }),
    };
    balances = {
      countAvailableDays: jest.fn().mockResolvedValue(21),
      consume: jest.fn().mockResolvedValue(undefined),
    };
    countBetween = jest.fn().mockReturnValue(5);
    workingDays = {
      createCalculator: jest.fn().mockResolvedValue({
        countBetween,
        isWorkingDay: jest.fn().mockReturnValue(true),
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmployeeService, useValue: employees },
        { provide: LeaveTypesService, useValue: leaveTypes },
        { provide: EmployeeLeaveBalancesService, useValue: balances },
        { provide: WorkingDaysService, useValue: workingDays },
      ],
    }).compile();

    service = moduleRef.get(LeaveRequestsService);
  });

  describe('createOwn — the span', () => {
    it('refuses an end before the start', async () => {
      await expect(
        service.createOwn('emp-1', { ...CREATE_BODY, endDate: '2026-09-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a one-day request, where both ends are the same date', async () => {
      countBetween.mockReturnValue(1);

      await expect(
        service.createOwn('emp-1', { ...CREATE_BODY, endDate: START }),
      ).resolves.toBeDefined();
    });

    it('refuses a span longer than a year', async () => {
      await expect(
        service.createOwn('emp-1', {
          ...CREATE_BODY,
          startDate: '2026-01-01',
          endDate: '2027-06-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a period containing no working days', async () => {
      countBetween.mockReturnValue(0);

      await expect(
        service.createOwn('emp-1', CREATE_BODY),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('createOwn — the leave type', () => {
    it('reports a leave type that does not exist as a bad body', async () => {
      leaveTypes.findPolicy.mockResolvedValue(null);

      await expect(
        service.createOwn('emp-1', CREATE_BODY),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a retired leave type, which is what isActive is for', async () => {
      leaveTypes.findPolicy.mockResolvedValue({
        requiresApproval: true,
        isActive: false,
      });

      await expect(
        service.createOwn('emp-1', CREATE_BODY),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('createOwn — replacements', () => {
    it('refuses the requesting employee as their own replacement', async () => {
      await expect(
        service.createOwn('emp-1', {
          ...CREATE_BODY,
          replacementEmployeeIds: ['emp-1'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a replacement who does not exist', async () => {
      prisma.employee.findMany.mockResolvedValue([]);

      await expect(
        service.createOwn('emp-1', CREATE_BODY),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a replacement already on approved leave over the span', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([
        {
          startDate: new Date(`${START}T00:00:00.000Z`),
          endDate: new Date(`${END}T00:00:00.000Z`),
          employee: {
            employeeCode: 'EMP-0002',
            firstName: 'Maria',
            lastName: 'Ionescu',
          },
        },
      ]);

      await expect(
        service.createOwn('emp-1', CREATE_BODY),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('only counts a replacement busy with APPROVED leave', async () => {
      await service.createOwn('emp-1', CREATE_BODY);

      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: LeaveRequestStatus.APPROVED,
          }),
        }),
      );
    });
  });

  describe('createOwn — the requester’s own overlap', () => {
    it('refuses a span overlapping leave already approved, as a conflict', async () => {
      prisma.leaveRequest.findFirst.mockResolvedValue({
        id: 'lvr-old',
        startDate: new Date(`${START}T00:00:00.000Z`),
        endDate: new Date(`${END}T00:00:00.000Z`),
      });

      await expect(
        service.createOwn('emp-1', CREATE_BODY),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('treats a shared boundary day as an overlap, since both ends are inclusive', async () => {
      await service.createOwn('emp-1', CREATE_BODY);

      expect(prisma.leaveRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startDate: { lte: new Date(`${END}T00:00:00.000Z`) },
            endDate: { gte: new Date(`${START}T00:00:00.000Z`) },
          }),
        }),
      );
    });
  });

  describe('createOwn — the balance', () => {
    it('refuses a request the employee cannot pay for', async () => {
      balances.countAvailableDays.mockResolvedValue(3);

      await expect(
        service.createOwn('emp-1', CREATE_BODY),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
    });

    it('never draws on a year later than the one the leave ends in', async () => {
      await service.createOwn('emp-1', CREATE_BODY);

      expect(balances.countAvailableDays).toHaveBeenCalledWith({
        employeeId: 'emp-1',
        leaveTypeId: 'lvt-1',
        upToYear: 2026,
      });
    });

    it('lets a request crossing New Year reach the year it ends in', async () => {
      await service.createOwn('emp-1', {
        ...CREATE_BODY,
        startDate: '2026-12-28',
        endDate: '2027-01-05',
      });

      expect(balances.countAvailableDays).toHaveBeenCalledWith(
        expect.objectContaining({ upToYear: 2027 }),
      );
    });
  });

  describe('createOwn — which kind of approval', () => {
    it('files a PENDING request and moves no balance when approval is required', async () => {
      await service.createOwn('emp-1', CREATE_BODY);

      expect(prisma.leaveRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: LeaveRequestStatus.PENDING,
            processedAt: null,
          }),
        }),
      );
      expect(balances.consume).not.toHaveBeenCalled();
    });

    it('files an APPROVED request and consumes the days when none is required', async () => {
      leaveTypes.findPolicy.mockResolvedValue({
        requiresApproval: false,
        isActive: true,
      });

      await service.createOwn('emp-1', CREATE_BODY);

      expect(prisma.leaveRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: LeaveRequestStatus.APPROVED,
          }),
        }),
      );
      expect(balances.consume).toHaveBeenCalledWith(
        { employeeId: 'emp-1', leaveTypeId: 'lvt-1', upToYear: 2026 },
        5,
        prisma,
      );
    });

    it('stamps processedAt but not processedById on an automatic approval', async () => {
      leaveTypes.findPolicy.mockResolvedValue({
        requiresApproval: false,
        isActive: true,
      });

      await service.createOwn('emp-1', CREATE_BODY);

      const { data } = prisma.leaveRequest.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };

      expect(data.processedAt).toBeInstanceOf(Date);
      expect(data.processedById).toBeUndefined();
    });

    it('reports an unknown caller as a 404 rather than filing anything', async () => {
      employees.findStatus.mockResolvedValue(null);

      await expect(
        service.createOwn('ghost', CREATE_BODY),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateOwn', () => {
    beforeEach(() => {
      prisma.leaveRequest.findFirst.mockImplementation(
        (args: { select?: unknown }) =>
          // The facts read comes first; the overlap check that follows must
          // still find nothing.
          'status' in ((args.select ?? {}) as Record<string, unknown>)
            ? Promise.resolve(STORED)
            : Promise.resolve(null),
      );
    });

    it('refuses to edit a request that has been decided', async () => {
      prisma.leaveRequest.findFirst.mockResolvedValue({
        ...STORED,
        status: LeaveRequestStatus.APPROVED,
      });

      await expect(
        service.updateOwn('emp-1', 'lvr-1', { reason: 'Changed my mind' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('judges a patched end date against the stored start date', async () => {
      await expect(
        service.updateOwn('emp-1', 'lvr-1', { endDate: '2026-09-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('leaves the replacements alone when the body does not carry them', async () => {
      await service.updateOwn('emp-1', 'lvr-1', { reason: 'Updated' });

      expect(prisma.leaveRequestReplacement.deleteMany).not.toHaveBeenCalled();
    });

    it('replaces the whole set when the body carries one', async () => {
      prisma.employee.findMany.mockResolvedValue([{ id: 'emp-3' }]);

      await service.updateOwn('emp-1', 'lvr-1', {
        replacementEmployeeIds: ['emp-3'],
      });

      expect(prisma.leaveRequestReplacement.deleteMany).toHaveBeenCalledWith({
        where: { leaveRequestId: 'lvr-1' },
      });
      expect(prisma.leaveRequestReplacement.createMany).toHaveBeenCalledWith({
        data: [{ leaveRequestId: 'lvr-1', employeeId: 'emp-3' }],
      });
    });

    it('moves no balance, because a PENDING request consumed nothing', async () => {
      await service.updateOwn('emp-1', 'lvr-1', { reason: 'Updated' });

      expect(balances.consume).not.toHaveBeenCalled();
    });
  });

  describe('removeOwn', () => {
    it('hard-deletes a PENDING request', async () => {
      prisma.leaveRequest.findFirst.mockResolvedValue(STORED);

      await service.removeOwn('emp-1', 'lvr-1');

      expect(prisma.leaveRequest.delete).toHaveBeenCalledWith({
        where: { id: 'lvr-1' },
      });
    });

    it('refuses to delete a decided request', async () => {
      prisma.leaveRequest.findFirst.mockResolvedValue({
        ...STORED,
        status: LeaveRequestStatus.APPROVED,
      });

      await expect(service.removeOwn('emp-1', 'lvr-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.leaveRequest.delete).not.toHaveBeenCalled();
    });

    it('answers 404 for somebody else’s request rather than revealing it', async () => {
      prisma.leaveRequest.findFirst.mockResolvedValue(null);

      await expect(service.removeOwn('emp-9', 'lvr-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('decide', () => {
    beforeEach(() => {
      prisma.leaveRequest.findUnique.mockResolvedValue(STORED);
    });

    it('consumes the balance when approving, in the same transaction', async () => {
      await service.decide('emp-9', 'lvr-1', {
        status: LeaveRequestStatus.APPROVED,
      });

      expect(balances.consume).toHaveBeenCalledWith(
        { employeeId: 'emp-1', leaveTypeId: 'lvt-1', upToYear: 2026 },
        5,
        prisma,
      );
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('moves no balance when rejecting', async () => {
      await service.decide('emp-9', 'lvr-1', {
        status: LeaveRequestStatus.REJECTED,
        decisionReason: 'Team is short-staffed that week',
      });

      expect(balances.consume).not.toHaveBeenCalled();
    });

    it('moves no balance when cancelling', async () => {
      await service.decide('emp-9', 'lvr-1', {
        status: LeaveRequestStatus.CANCELLED,
        decisionReason: 'Withdrawn at the employee’s request',
      });

      expect(balances.consume).not.toHaveBeenCalled();
    });

    it('records who decided and when', async () => {
      await service.decide('emp-9', 'lvr-1', {
        status: LeaveRequestStatus.APPROVED,
      });

      const { data } = prisma.leaveRequest.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };

      expect(data.processedById).toBe('emp-9');
      expect(data.processedAt).toBeInstanceOf(Date);
    });

    it('refuses to decide a request that is already decided', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue({
        ...STORED,
        status: LeaveRequestStatus.APPROVED,
      });

      await expect(
        service.decide('emp-9', 'lvr-1', {
          status: LeaveRequestStatus.CANCELLED,
          decisionReason: 'Too late',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('requires a reason for a rejection', async () => {
      await expect(
        service.decide('emp-9', 'lvr-1', {
          status: LeaveRequestStatus.REJECTED,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires a reason for a cancellation', async () => {
      await expect(
        service.decide('emp-9', 'lvr-1', {
          status: LeaveRequestStatus.CANCELLED,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a reason on an approval', async () => {
      await expect(
        service.decide('emp-9', 'lvr-1', {
          status: LeaveRequestStatus.APPROVED,
          decisionReason: 'Fine by me',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('re-checks the overlap at approval time, not only at filing time', async () => {
      prisma.leaveRequest.findFirst.mockResolvedValue({
        id: 'lvr-other',
        startDate: new Date(`${START}T00:00:00.000Z`),
        endDate: new Date(`${END}T00:00:00.000Z`),
      });

      await expect(
        service.decide('emp-9', 'lvr-1', {
          status: LeaveRequestStatus.APPROVED,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(balances.consume).not.toHaveBeenCalled();
    });

    it('recounts the days rather than trusting a number from filing time', async () => {
      countBetween.mockReturnValue(4);

      await service.decide('emp-9', 'lvr-1', {
        status: LeaveRequestStatus.APPROVED,
      });

      expect(balances.consume).toHaveBeenCalledWith(
        expect.anything(),
        4,
        prisma,
      );
    });

    it('rejects a decider the header names but the database does not hold', async () => {
      employees.findStatus.mockResolvedValue(null);

      await expect(
        service.decide('ghost', 'lvr-1', {
          status: LeaveRequestStatus.APPROVED,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findAll', () => {
    const query = (overrides: Partial<LeaveRequestQueryDto> = {}) =>
      Object.assign(
        new LeaveRequestQueryDto(),
        overrides,
      ) as LeaveRequestQueryDto;

    it('reads the rows and the total under one snapshot', async () => {
      await service.findAll(query());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('asks the calendar nothing when the page is empty', async () => {
      await service.findAll(query());

      expect(workingDays.createCalculator).not.toHaveBeenCalled();
    });

    it('loads the calendar once for a page of many rows', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([ROW, ROW, ROW]);
      prisma.leaveRequest.count.mockResolvedValue(3);

      const result = await service.findAll(query());

      expect(workingDays.createCalculator).toHaveBeenCalledTimes(1);
      expect(result.items).toHaveLength(3);
      expect(result.items[0].requestedWorkingDays).toBe(5);
    });

    it('defaults to the current year', () => {
      expect(query().year).toBe(new Date().getUTCFullYear());
    });

    it('orders by the person’s name when asked to sort by employee', async () => {
      await service.findAll(query({ sortBy: 'employee' }));

      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { employee: { lastName: 'asc' } },
            { employee: { firstName: 'asc' } },
            { id: 'asc' },
          ],
        }),
      );
    });
  });

  describe('findOwn', () => {
    it('scopes to the caller and reports an unknown one as a 404', async () => {
      employees.findStatus.mockResolvedValue(null);

      await expect(
        service.findOwn('ghost', new MyLeaveRequestQueryDto()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('omits the employee from the payload, since the caller named them', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([ROW]);
      prisma.leaveRequest.count.mockResolvedValue(1);

      const result = await service.findOwn(
        'emp-1',
        new MyLeaveRequestQueryDto(),
      );

      expect(result.items[0]).not.toHaveProperty('employee');
    });
  });

  /**
   * The Feature 030 extension: half a day is a *quantity* qualifying a request of
   * any type, not a kind of leave. The two columns are one fact stated twice, so
   * they are merged, judged and written together.
   */
  describe('half-day absences', () => {
    /** The `data` the last `create` was handed. */
    const createdData = () =>
      (prisma.leaveRequest.create.mock.calls.at(-1)?.[0] as { data: any }).data;

    /** The `data` the last `update` was handed. */
    const updatedData = () =>
      (prisma.leaveRequest.update.mock.calls.at(-1)?.[0] as { data: any }).data;

    /**
     * A stored half-day request for a `PATCH` to merge into.
     *
     * `findFirst` serves two callers here — the facts read and the overlap check —
     * so the mock discriminates by `select`, exactly as the `updateOwn` block
     * above does. A blanket `mockResolvedValue` would make the overlap check
     * believe the request conflicts with itself.
     */
    const storedHalfDay = (portion: LeaveHalfDayPortion) => {
      prisma.leaveRequest.findFirst.mockImplementation(
        (args: { select?: unknown }) =>
          'status' in ((args.select ?? {}) as Record<string, unknown>)
            ? Promise.resolve({
                ...STORED,
                isHalfDay: true,
                halfDayPortion: portion,
              })
            : Promise.resolve(null),
      );
    };

    it('stores a whole-day absence when nothing is said', async () => {
      await service.createOwn('emp-1', CREATE_BODY);

      expect(createdData()).toMatchObject({
        isHalfDay: false,
        halfDayPortion: null,
      });
    });

    it('stores the portion of a half-day absence', async () => {
      await service.createOwn('emp-1', {
        ...CREATE_BODY,
        isHalfDay: true,
        halfDayPortion: LeaveHalfDayPortion.SECOND_HALF,
      });

      expect(createdData()).toMatchObject({
        isHalfDay: true,
        halfDayPortion: LeaveHalfDayPortion.SECOND_HALF,
      });
    });

    // Without it the Timesheets module cannot tell which hours are left for work.
    it('requires the portion when the absence is a half day', async () => {
      const problems = await messagesFrom(
        service.createOwn('emp-1', { ...CREATE_BODY, isHalfDay: true }),
      );

      expect(problems).toEqual([
        'halfDayPortion is required when isHalfDay is true',
      ]);
    });

    // A stray portion on a whole day would leave a later reader unable to tell
    // which of the two columns was the mistake.
    it('refuses a portion on a whole-day absence', async () => {
      const problems = await messagesFrom(
        service.createOwn('emp-1', {
          ...CREATE_BODY,
          halfDayPortion: LeaveHalfDayPortion.FIRST_HALF,
        }),
      );

      expect(problems).toEqual([
        'halfDayPortion must not be sent when isHalfDay is false',
      ]);
    });

    it('is orthogonal to the leave type: any type may be taken for half a day', async () => {
      await service.createOwn('emp-1', {
        ...CREATE_BODY,
        leaveTypeId: 'lvt-medical',
        isHalfDay: true,
        halfDayPortion: LeaveHalfDayPortion.FIRST_HALF,
      });

      expect(createdData()).toMatchObject({
        leaveTypeId: 'lvt-medical',
        isHalfDay: true,
      });
    });

    /**
     * Clearing rather than refusing on this one path: `{ isHalfDay: false }` is a
     * caller saying "a whole day again", and demanding they also send
     * `halfDayPortion: null` would be asking them to state it twice.
     */
    it('clears the portion when a patch makes the absence a whole day again', async () => {
      storedHalfDay(LeaveHalfDayPortion.FIRST_HALF);

      await service.updateOwn('emp-1', 'lvr-1', { isHalfDay: false });

      expect(updatedData()).toMatchObject({
        isHalfDay: false,
        halfDayPortion: null,
      });
    });

    it('keeps the stored portion when a patch touches neither field', async () => {
      storedHalfDay(LeaveHalfDayPortion.SECOND_HALF);

      await service.updateOwn('emp-1', 'lvr-1', { reason: 'Changed my mind' });

      expect(updatedData()).toMatchObject({
        isHalfDay: true,
        halfDayPortion: LeaveHalfDayPortion.SECOND_HALF,
      });
    });

    /**
     * The limitation this extension deliberately does not change: balances are
     * counted in whole days, so a half day still consumes one. Making the day
     * count fractional is a decision with its own migration.
     */
    it('does not halve the working days a half-day request consumes', async () => {
      const request = await service.createOwn('emp-1', {
        ...CREATE_BODY,
        isHalfDay: true,
        halfDayPortion: LeaveHalfDayPortion.FIRST_HALF,
      });

      expect(request.requestedWorkingDays).toBe(5);
    });
  });

  /**
   * The two reads Feature 030 added for the Timesheets module. They are here
   * rather than in that module for the rule this project keeps everywhere: the
   * module that owns a table is the only one that queries it.
   */
  describe('reads for the timesheet module', () => {
    it('returns only approved absences overlapping the span', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'lvr-1',
          startDate: new Date(`${START}T00:00:00.000Z`),
          endDate: new Date(`${END}T00:00:00.000Z`),
          isHalfDay: false,
          halfDayPortion: null,
          leaveType: { label: 'Annual Leave' },
        },
      ]);

      const span = {
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T00:00:00.000Z'),
      };

      await expect(service.findApprovedInSpan('emp-1', span)).resolves.toEqual([
        expect.objectContaining({
          id: 'lvr-1',
          leaveTypeLabel: 'Annual Leave',
          isHalfDay: false,
        }) as unknown,
      ]);

      const { where } = prisma.leaveRequest.findMany.mock.calls.at(-1)?.[0] as {
        where: Record<string, unknown>;
      };

      // A PENDING request may yet be refused; pre-populating from one would put
      // hours on a timesheet for an absence nobody has granted.
      expect(where).toMatchObject({
        employeeId: 'emp-1',
        status: LeaveRequestStatus.APPROVED,
      });
    });

    it('reports whether any approval landed after a given moment', async () => {
      prisma.leaveRequest.findFirst.mockResolvedValue({ id: 'lvr-1' });

      const span = {
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T00:00:00.000Z'),
      };
      const since = new Date('2026-09-20T00:00:00.000Z');

      await expect(
        service.hasApprovalsSince('emp-1', span, since),
      ).resolves.toBe(true);

      const { where } = prisma.leaveRequest.findFirst.mock.calls.at(
        -1,
      )?.[0] as {
        where: Record<string, unknown>;
      };

      // `processedAt` and not `updatedAt`: a typo corrected in a reason must not
      // mark every timesheet touching that month stale.
      expect(where).toMatchObject({ processedAt: { gt: since } });
    });
  });
});
