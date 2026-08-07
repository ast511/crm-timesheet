import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { UpdateWorkScheduleDto } from './dto/update-work-schedule.dto';
import { PublicWorkScheduleRow } from './entities/work-schedule.entity';
import { DEFAULT_TIMEZONE, WORK_SCHEDULE_ID } from './work-schedule.constants';
import { WorkScheduleService } from './work-schedule.service';

/**
 * Stands in for the `Decimal` instances the driver returns for a `decimal`
 * column. Only `toNumber()` is exercised, which is all the entity mapper calls.
 */
const decimal = (value: number) =>
  ({ toNumber: () => value }) as PublicWorkScheduleRow['minHoursPerEntry'];

const CREATED_AT = new Date('2026-08-04T09:00:00.000Z');
const UPDATED_AT = new Date('2026-08-04T10:30:00.000Z');

/** A configuration row, as PostgreSQL returns it. */
const SCHEDULE_ROW: PublicWorkScheduleRow = {
  workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  weekStartsOn: 'MONDAY',
  timezone: DEFAULT_TIMEZONE,
  workStartTime: '09:00',
  workEndTime: '18:00',
  minHoursPerEntry: decimal(0.5),
  maxHoursPerEntry: decimal(8),
  maxHoursPerDay: decimal(8),
  standardHoursPerDay: decimal(8),
  standardHoursPerWeek: decimal(40),
  lunchBreakHours: decimal(1),
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

/** The same configuration, as the API publishes it. */
const SCHEDULE_ENTITY = {
  workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  weekStartsOn: 'MONDAY',
  timezone: DEFAULT_TIMEZONE,
  workStartTime: '09:00',
  workEndTime: '18:00',
  minHoursPerEntry: 0.5,
  maxHoursPerEntry: 8,
  maxHoursPerDay: 8,
  standardHoursPerDay: 8,
  standardHoursPerWeek: 40,
  lunchBreakHours: 1,
  createdAt: '2026-08-04T09:00:00.000Z',
  updatedAt: '2026-08-04T10:30:00.000Z',
};

const SAVE_BODY: UpdateWorkScheduleDto = {
  workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  weekStartsOn: 'MONDAY',
  workStartTime: '09:00',
  workEndTime: '18:00',
  minHoursPerEntry: 0.5,
  maxHoursPerEntry: 8,
  maxHoursPerDay: 8,
  standardHoursPerDay: 8,
  standardHoursPerWeek: 40,
  lunchBreakHours: 1,
};

const EMAIL_ROW = {
  id: 'eml-1',
  email: 'hr@example.com',
  createdAt: CREATED_AT,
};

const EMAIL_ENTITY = {
  id: 'eml-1',
  email: 'hr@example.com',
  createdAt: '2026-08-04T09:00:00.000Z',
};

describe('WorkScheduleService', () => {
  let service: WorkScheduleService;
  let prisma: {
    workSchedule: { findUnique: jest.Mock; upsert: jest.Mock };
    timesheetApprovalEmail: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      workSchedule: { findUnique: jest.fn(), upsert: jest.fn() },
      timesheetApprovalEmail: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        WorkScheduleService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(WorkScheduleService);
  });

  describe('find', () => {
    it('reads the one configuration by its constant key', async () => {
      prisma.workSchedule.findUnique.mockResolvedValue(SCHEDULE_ROW);

      await expect(service.find()).resolves.toEqual(SCHEDULE_ENTITY);
      expect(prisma.workSchedule.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: WORK_SCHEDULE_ID } }),
      );
    });

    it('reports 404 while nothing has been configured', async () => {
      prisma.workSchedule.findUnique.mockResolvedValue(null);

      await expect(service.find()).rejects.toBeInstanceOf(NotFoundException);
    });

    /**
     * The frontend edits the zone through the same `PUT` as everything else, so
     * it has to be able to read the current one to pre-fill the field. A column
     * that is writable and invisible would be a form that cannot show what it is
     * about to overwrite.
     */
    it('publishes the timezone, so an editor can be pre-filled', async () => {
      prisma.workSchedule.findUnique.mockResolvedValue(SCHEDULE_ROW);

      const schedule = await service.find();

      expect(schedule.timezone).toBe(DEFAULT_TIMEZONE);
    });

    /** The decimals must leave as numbers, or a client receives Decimal.js. */
    it('renders the hour columns as plain numbers', async () => {
      prisma.workSchedule.findUnique.mockResolvedValue(SCHEDULE_ROW);

      const schedule = await service.find();

      expect(schedule.minHoursPerEntry).toBe(0.5);
      expect(typeof schedule.standardHoursPerWeek).toBe('number');
    });
  });

  describe('save', () => {
    beforeEach(() => {
      prisma.workSchedule.upsert.mockResolvedValue(SCHEDULE_ROW);
    });

    it('upserts on the constant key, so create and update are one call', async () => {
      await expect(service.save(SAVE_BODY)).resolves.toEqual(SCHEDULE_ENTITY);

      expect(prisma.workSchedule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: WORK_SCHEDULE_ID },
          create: expect.objectContaining({ id: WORK_SCHEDULE_ID }),
        }),
      );
    });

    /** A PUT replaces: the update half writes every column, not a subset. */
    it('writes the whole body on update', async () => {
      await service.save(SAVE_BODY);

      const [{ update }] = prisma.workSchedule.upsert.mock.calls[0] as [
        { update: Record<string, unknown> },
      ];

      expect(update).toEqual(SAVE_BODY);
    });

    it('refuses a maximum entry that does not exceed the minimum', async () => {
      const contradictory = {
        ...SAVE_BODY,
        minHoursPerEntry: 4,
        maxHoursPerEntry: 2,
      };

      await expect(service.save(contradictory)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.workSchedule.upsert).not.toHaveBeenCalled();
    });

    it('refuses equal bounds, since the rule is "greater than"', async () => {
      const equal = {
        ...SAVE_BODY,
        minHoursPerEntry: 8,
        maxHoursPerEntry: 8,
      };

      await expect(service.save(equal)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    /**
     * The rule this feature is most easily "improved" into breaking: the lunch
     * break is recorded exactly as sent and removed from nothing.
     */
    it('stores lunchBreakHours untouched and deducts it from nothing', async () => {
      await service.save({ ...SAVE_BODY, lunchBreakHours: 1 });

      const [{ update }] = prisma.workSchedule.upsert.mock.calls[0] as [
        { update: UpdateWorkScheduleDto },
      ];

      expect(update.lunchBreakHours).toBe(1);
      expect(update.standardHoursPerDay).toBe(SAVE_BODY.standardHoursPerDay);
      expect(update.maxHoursPerDay).toBe(SAVE_BODY.maxHoursPerDay);
    });

    it('accepts a zero lunch break', async () => {
      await expect(
        service.save({ ...SAVE_BODY, lunchBreakHours: 0 }),
      ).resolves.toEqual(SCHEDULE_ENTITY);
    });

    it('persists a timezone the body states', async () => {
      await service.save({ ...SAVE_BODY, timezone: 'America/New_York' });

      const [{ update, create }] = prisma.workSchedule.upsert.mock.calls[0] as [
        { update: UpdateWorkScheduleDto; create: UpdateWorkScheduleDto },
      ];

      expect(update.timezone).toBe('America/New_York');
      expect(create.timezone).toBe('America/New_York');
    });

    /**
     * The rule the whole optionality of this field exists for. An administrator
     * saving the hours from a form built before the zone was configurable must
     * not have their zone reset underneath them — per the schema comment, that
     * would silently re-interpret which calendar day every stored instant falls
     * on, as the side effect of a request about something else entirely.
     *
     * `undefined` rather than a value is what makes that true: Prisma leaves an
     * undefined column out of the update, and falls back to the column's default
     * on the create. This is deliberately *not* the answer `weekStartsOn` gives,
     * which restates its default because restating it changes nothing.
     */
    it('leaves the stored timezone alone when the body omits one', async () => {
      await service.save(SAVE_BODY);

      const [{ update }] = prisma.workSchedule.upsert.mock.calls[0] as [
        { update: UpdateWorkScheduleDto },
      ];

      expect(update.timezone).toBeUndefined();
      expect(update.weekStartsOn).toBe('MONDAY');
    });
  });

  /**
   * The accessor Timesheet and Reporting call instead of querying
   * `work_schedules`, so the zone days are grouped in has one owner.
   */
  describe('findTimezone', () => {
    it('reads the one column, not the whole configuration', async () => {
      prisma.workSchedule.findUnique.mockResolvedValue({
        timezone: 'America/New_York',
      });

      await expect(service.findTimezone()).resolves.toBe('America/New_York');
      expect(prisma.workSchedule.findUnique).toHaveBeenCalledWith({
        where: { id: WORK_SCHEDULE_ID },
        select: { timezone: true },
      });
    });

    /** A guessed zone is a guess about which day somebody's work happened. */
    it('reports the schedule missing rather than assuming a zone', async () => {
      prisma.workSchedule.findUnique.mockResolvedValue(null);

      await expect(service.findTimezone()).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('approval emails', () => {
    /** Every address route needs the schedule first; this is the happy path. */
    const configured = () =>
      prisma.workSchedule.findUnique.mockResolvedValue({
        id: WORK_SCHEDULE_ID,
      });

    it('lists the addresses of the one configuration, ordered by address', async () => {
      configured();
      prisma.timesheetApprovalEmail.findMany.mockResolvedValue([EMAIL_ROW]);

      await expect(service.findEmails()).resolves.toEqual([EMAIL_ENTITY]);
      expect(prisma.timesheetApprovalEmail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workScheduleId: WORK_SCHEDULE_ID },
          orderBy: { email: 'asc' },
        }),
      );
    });

    it('reports 404 rather than an empty list when nothing is configured', async () => {
      prisma.workSchedule.findUnique.mockResolvedValue(null);

      await expect(service.findEmails()).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.timesheetApprovalEmail.findMany).not.toHaveBeenCalled();
    });

    it('adds an address to the one configuration', async () => {
      configured();
      prisma.timesheetApprovalEmail.findFirst.mockResolvedValue(null);
      prisma.timesheetApprovalEmail.create.mockResolvedValue(EMAIL_ROW);

      await expect(
        service.addEmail({ email: 'hr@example.com' }),
      ).resolves.toEqual(EMAIL_ENTITY);

      expect(prisma.timesheetApprovalEmail.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { email: 'hr@example.com', workScheduleId: WORK_SCHEDULE_ID },
        }),
      );
    });

    it('rejects an address already on the list, without inserting', async () => {
      configured();
      prisma.timesheetApprovalEmail.findFirst.mockResolvedValue({
        id: 'eml-1',
      });

      await expect(
        service.addEmail({ email: 'hr@example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.timesheetApprovalEmail.create).not.toHaveBeenCalled();
    });

    /**
     * The DTO lower-cases, so the stored value is already folded; the check
     * folds as well, which is what closes the gap for a row written any other
     * way.
     */
    it('compares addresses case-insensitively', async () => {
      configured();
      prisma.timesheetApprovalEmail.findFirst.mockResolvedValue(null);
      prisma.timesheetApprovalEmail.create.mockResolvedValue(EMAIL_ROW);

      await service.addEmail({ email: 'hr@example.com' });

      expect(prisma.timesheetApprovalEmail.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            email: { equals: 'hr@example.com', mode: 'insensitive' },
          },
        }),
      );
    });

    it('refuses to add an address before the schedule exists', async () => {
      prisma.workSchedule.findUnique.mockResolvedValue(null);

      await expect(
        service.addEmail({ email: 'hr@example.com' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.timesheetApprovalEmail.create).not.toHaveBeenCalled();
    });

    it('deletes an address by id', async () => {
      prisma.timesheetApprovalEmail.findUnique.mockResolvedValue({
        id: 'eml-1',
      });
      prisma.timesheetApprovalEmail.delete.mockResolvedValue(EMAIL_ROW);

      await expect(service.removeEmail('eml-1')).resolves.toBeUndefined();
      expect(prisma.timesheetApprovalEmail.delete).toHaveBeenCalledWith({
        where: { id: 'eml-1' },
      });
    });

    it('reports 404 for an unknown address instead of letting Prisma throw', async () => {
      prisma.timesheetApprovalEmail.findUnique.mockResolvedValue(null);

      await expect(service.removeEmail('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.timesheetApprovalEmail.delete).not.toHaveBeenCalled();
    });
  });
});
