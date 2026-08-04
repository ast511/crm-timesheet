import type { Weekday } from '../../src/generated/prisma/enums';
import { WORK_SCHEDULE_ID } from '../../src/modules/work-schedule/work-schedule.constants';

import type { SeedClient } from './seed-context';

interface WorkScheduleSeed {
  /** Written in week order, which is also the order the API stores them in. */
  readonly workingDays: Weekday[];
  readonly workStartTime: string;
  readonly workEndTime: string;
  readonly minHoursPerEntry: number;
  readonly maxHoursPerEntry: number;
  readonly maxHoursPerDay: number;
  readonly standardHoursPerDay: number;
  readonly standardHoursPerWeek: number;
  /** Recorded only — nothing subtracts it. */
  readonly lunchBreakHours: number;
}

/**
 * The development working schedule: a Monday-to-Friday, nine-to-six company.
 *
 * These are the values Feature 016 documents as the example configuration, and
 * they exist in the seed for a practical reason — `GET /api/v1/work-schedule`
 * answers `404` until something is stored, so without this every developer's
 * first request against the module would be an error. A real deployment states
 * its own through `PUT /api/v1/work-schedule`; nothing back-fills it.
 *
 * `lunchBreakHours` is one hour and is subtracted from nothing. The seeded day
 * therefore runs 09:00–18:00 with eight standard hours, which is a nine-hour
 * office day containing an unpaid hour — exactly the arrangement the field is
 * there to record.
 */
const WORK_SCHEDULE: WorkScheduleSeed = {
  workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  workStartTime: '09:00',
  workEndTime: '18:00',
  minHoursPerEntry: 0.5,
  maxHoursPerEntry: 8,
  maxHoursPerDay: 8,
  standardHoursPerDay: 8,
  standardHoursPerWeek: 40,
  lunchBreakHours: 1,
};

/**
 * Addresses notified when a timesheet needs approval.
 *
 * The domain matches the seeded accounts in `users.seed.ts`, and both are role
 * mailboxes rather than a person's — the list outlives whoever currently reads
 * it.
 */
const APPROVAL_EMAILS = ['hr@example.com', 'payroll@example.com'] as const;

/**
 * Seeds the configuration and its approval addresses.
 *
 * No dependencies, and idempotent like every other seed: the schedule is
 * upserted on its constant primary key — the same key the application uses, so
 * a re-run refreshes the one row rather than creating a second — and each
 * address is upserted on its unique `email`.
 *
 * Returns the number of approval addresses, since the schedule itself is always
 * exactly one.
 */
export async function seedWorkSchedule(prisma: SeedClient): Promise<number> {
  await prisma.workSchedule.upsert({
    where: { id: WORK_SCHEDULE_ID },
    update: WORK_SCHEDULE,
    create: { id: WORK_SCHEDULE_ID, ...WORK_SCHEDULE },
  });

  for (const email of APPROVAL_EMAILS) {
    await prisma.timesheetApprovalEmail.upsert({
      where: { email },
      update: { workScheduleId: WORK_SCHEDULE_ID },
      create: { email, workScheduleId: WORK_SCHEDULE_ID },
    });
  }

  return APPROVAL_EMAILS.length;
}
