import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { SortOrder } from '../../common/enums/sort-order.enum';
import type { Weekday } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTimesheetApprovalEmailDto } from './dto/create-timesheet-approval-email.dto';
import { UpdateWorkScheduleDto } from './dto/update-work-schedule.dto';
import {
  APPROVAL_EMAIL_PUBLIC_SELECT,
  TimesheetApprovalEmailEntity,
  toApprovalEmailEntity,
} from './entities/timesheet-approval-email.entity';
import {
  toWorkScheduleEntity,
  WORK_SCHEDULE_PUBLIC_SELECT,
  WorkScheduleEntity,
} from './entities/work-schedule.entity';
import { WORK_SCHEDULE_ID } from './work-schedule.constants';

/**
 * Every rule about the working schedule lives here; the controller only routes.
 *
 * Three of them are worth naming, because they are what makes this module
 * something other than a sixth copy of the same CRUD shape:
 *
 * 1. **There is one configuration, and it has a known key.** Every read and
 *    write addresses {@link WORK_SCHEDULE_ID}, so `PUT` is an `upsert` on a
 *    primary key rather than a "find something, and create one if there wasn't
 *    anything". The database enforces the same thing from its side: the column
 *    defaults to that literal, so an insert that does not name a key collides
 *    with the row already holding it.
 * 2. **`lunchBreakHours` is stored and used by nothing.** It is not an
 *    oversight to be corrected later: hours are what an employee books, and
 *    silently removing an hour from a day somebody logged would make the stored
 *    total disagree with what they entered. The value is here so a report, an
 *    export or a future policy can *state* the company's lunch break; whether
 *    it should ever be deducted is a decision for the feature that has a reason
 *    to deduct it, with a name on it.
 * 3. **Nothing here computes anything.** No day is counted, no week is summed,
 *    no entry is judged. This module configures; the Timesheets module reads
 *    the configuration and validates against it. Keeping the two apart is what
 *    lets the rules change without a migration of anything already recorded.
 */
@Injectable()
export class WorkScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The current configuration.
   *
   * A `404` when none has been stored yet, rather than a body of defaults.
   * Defaults would be a guess about how this company works, dressed as an
   * answer — and a client could not tell the guess apart from a configuration
   * somebody actually entered. The 404 says exactly what is true, and the
   * message says what to do about it.
   */
  async find(): Promise<WorkScheduleEntity> {
    const schedule = await this.prisma.workSchedule.findUnique({
      where: { id: WORK_SCHEDULE_ID },
      select: WORK_SCHEDULE_PUBLIC_SELECT,
    });

    if (schedule === null) {
      throw new NotFoundException(NOT_CONFIGURED_MESSAGE);
    }

    return toWorkScheduleEntity(schedule);
  }

  /**
   * Stores the configuration, creating it the first time.
   *
   * One `upsert` rather than a read followed by a create or an update: the two
   * would race — two administrators saving at once could both find nothing and
   * both insert — and the second insert would be the duplicate key the upsert
   * exists to avoid. It also means the caller never has to know which of the
   * two happened, which is what makes a single `PUT` the whole write API.
   *
   * The body is complete, so `update` writes every column: a `PUT` replaces the
   * configuration rather than merging into it.
   *
   * `timezone` is the one exception, and it is an exception on purpose. It is
   * optional on the DTO with no initialiser, so an omitted one arrives here as
   * `undefined` — which Prisma reads as "do not write this column" on the update
   * half and as "take the column's default" on the create half. Both are the
   * answer this field needs: an administrator saving the hours from a form that
   * predates the field keeps the zone they configured, and a first-ever `PUT`
   * lands on `Europe/Bucharest`. Spelling it out rather than leaving it implicit,
   * because the alternative — defaulting it here — would quietly re-interpret
   * which calendar day every stored instant falls on, and would do it as the side
   * effect of a request about something else.
   */
  async save(dto: UpdateWorkScheduleDto): Promise<WorkScheduleEntity> {
    assertEntryRangeIsOrdered(dto);

    const data = {
      workingDays: dto.workingDays,
      weekStartsOn: dto.weekStartsOn,
      timezone: dto.timezone,
      workStartTime: dto.workStartTime,
      workEndTime: dto.workEndTime,
      minHoursPerEntry: dto.minHoursPerEntry,
      maxHoursPerEntry: dto.maxHoursPerEntry,
      maxHoursPerDay: dto.maxHoursPerDay,
      standardHoursPerDay: dto.standardHoursPerDay,
      standardHoursPerWeek: dto.standardHoursPerWeek,
      lunchBreakHours: dto.lunchBreakHours,
    };

    const saved = await this.prisma.workSchedule.upsert({
      where: { id: WORK_SCHEDULE_ID },
      // The id is stated rather than left to the column's default, so the row
      // this creates is the one the `where` above will find next time even if
      // the default is ever changed.
      create: { id: WORK_SCHEDULE_ID, ...data },
      update: data,
      select: WORK_SCHEDULE_PUBLIC_SELECT,
    });

    return toWorkScheduleEntity(saved);
  }

  /**
   * Which weekdays the company works.
   *
   * Public because Feature 023 is the first module with a reason to compute
   * against the schedule, and this module owns `work_schedules` — the same
   * hand-off `DepartmentService`, `PositionService` and `LeaveTypesService` each
   * make with their `exists`. `WorkingDaysService` counts the working days in a
   * leave span, and this one column is all it needs from here.
   *
   * It returns the array rather than the whole entity on purpose: publishing
   * `find()` to a consumer would hand it eight hour figures it has no business
   * reading, and would make every future column of this table part of the
   * contract between the two modules.
   *
   * A `404` when nothing has been configured, which is the same answer `find()`
   * gives and for the same reason: without knowing which weekdays are worked, a
   * day count is not a number anything can guess, and a default would be a guess
   * dressed as an answer. The message names the request that fixes it, so a
   * caller who meets this while filing leave is told what is actually missing.
   *
   * This is the only computation-adjacent method here, and it still computes
   * nothing: it reports the configuration, and the module that has a reason to
   * count does the counting. That is the division the class doc describes, kept
   * intact.
   */
  async findWorkingDays(): Promise<Weekday[]> {
    const schedule = await this.prisma.workSchedule.findUnique({
      where: { id: WORK_SCHEDULE_ID },
      select: { workingDays: true },
    });

    if (schedule === null) {
      throw new NotFoundException(NOT_CONFIGURED_MESSAGE);
    }

    return schedule.workingDays;
  }

  /**
   * The zone the company's calendar days are read in.
   *
   * The accessor Timesheet and Reporting call rather than reading
   * `work_schedules` themselves — the same hand-off {@link findWorkingDays}
   * makes, and one column for the same reason: a feature that needs to know which
   * day an instant belongs to has no business receiving eight hour figures, and
   * publishing the whole entity would make every future column of this table part
   * of the contract between the modules.
   *
   * **One zone for the whole application, not one per employee.** Which day an
   * instant falls on has to have a single answer, or the same timesheet would
   * total differently depending on who asked; a per-person zone is a separate and
   * much larger feature, and nothing here anticipates one.
   *
   * A `404` when nothing has been configured, which is what every other read here
   * answers and for the same reason: a guessed zone is a guess about which day
   * somebody's work happened, and the message names the request that fixes it.
   *
   * It reports the configuration and interprets nothing — no date is converted
   * here, and no day is grouped. The module that has a reason to group days does
   * the grouping, which is the division this class has kept since Feature 016.
   */
  async findTimezone(): Promise<string> {
    const schedule = await this.prisma.workSchedule.findUnique({
      where: { id: WORK_SCHEDULE_ID },
      select: { timezone: true },
    });

    if (schedule === null) {
      throw new NotFoundException(NOT_CONFIGURED_MESSAGE);
    }

    return schedule.timezone;
  }

  /**
   * Every approval address, ordered by address.
   *
   * A total order, since `email` is unique — so the list is stable between two
   * requests that changed nothing, which `createdAt` alone could not promise.
   *
   * Not paginated, deliberately: the collection is a handful of addresses a
   * person maintains by hand, and a page envelope around four rows would be
   * ceremony a client has to unwrap for nothing.
   */
  async findEmails(): Promise<TimesheetApprovalEmailEntity[]> {
    await this.assertConfigured();

    const emails = await this.prisma.timesheetApprovalEmail.findMany({
      where: { workScheduleId: WORK_SCHEDULE_ID },
      orderBy: { email: SortOrder.ASC },
      select: APPROVAL_EMAIL_PUBLIC_SELECT,
    });

    return emails.map(toApprovalEmailEntity);
  }

  /**
   * Adds an approval address.
   *
   * The address is checked for a duplicate before the insert so the answer is a
   * `409` naming the address, rather than the driver error a unique-violation
   * would otherwise surface as a `500`.
   */
  async addEmail(
    dto: CreateTimesheetApprovalEmailDto,
  ): Promise<TimesheetApprovalEmailEntity> {
    await this.assertConfigured();
    await this.assertEmailIsFree(dto.email);

    const created = await this.prisma.timesheetApprovalEmail.create({
      data: { email: dto.email, workScheduleId: WORK_SCHEDULE_ID },
      select: APPROVAL_EMAIL_PUBLIC_SELECT,
    });

    return toApprovalEmailEntity(created);
  }

  /**
   * Removes one approval address.
   *
   * A hard delete, unlike the deletes in the other modules: an address on this
   * list is a routing rule, not a record of anything that happened, so nothing
   * refers back to it and removing it rewrites no history. Existence is checked
   * first so an unknown id is a `404` rather than Prisma's `P2025`.
   */
  async removeEmail(id: string): Promise<void> {
    const approvalEmail = await this.prisma.timesheetApprovalEmail.findUnique({
      where: { id },
      select: { id: true },
    });

    if (approvalEmail === null) {
      throw new NotFoundException(`Approval email ${id} was not found`);
    }

    await this.prisma.timesheetApprovalEmail.delete({ where: { id } });
  }

  /**
   * Refuses to touch the address list before the schedule exists.
   *
   * The addresses hang off the configuration by a required foreign key, so
   * without it there is nothing for them to belong to — the collection is not
   * empty, it is not there. A `404` says that; an empty array would claim the
   * schedule was configured and simply had no addresses.
   */
  private async assertConfigured(): Promise<void> {
    const schedule = await this.prisma.workSchedule.findUnique({
      where: { id: WORK_SCHEDULE_ID },
      select: { id: true },
    });

    if (schedule === null) {
      throw new NotFoundException(NOT_CONFIGURED_MESSAGE);
    }
  }

  /**
   * Rejects an address already on the list.
   *
   * The comparison is case-insensitive because `HR@company.com` and
   * `hr@company.com` are one mailbox to every mail server, while PostgreSQL's
   * unique index sees two rows. That index still backs this check for the
   * exact-case race between the read and the write — and the DTO lower-cases
   * before either, so in practice the gap is closed.
   */
  private async assertEmailIsFree(email: string): Promise<void> {
    const conflict = await this.prisma.timesheetApprovalEmail.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });

    if (conflict !== null) {
      throw new ConflictException(
        `The approval email "${email}" has already been added`,
      );
    }
  }
}

/**
 * Reported by every path that needs the configuration and does not find it, so
 * the four of them cannot drift apart.
 */
const NOT_CONFIGURED_MESSAGE =
  'The work schedule has not been configured yet. Send PUT /api/v1/work-schedule to create it.';

/**
 * Rejects an entry range whose maximum does not exceed its minimum.
 *
 * The one rule about two fields at once, and the reason it is here rather than
 * on the DTO: it belongs with the other statements about what a valid
 * configuration is, and it is checked before anything is written, so a
 * contradictory body never reaches the database.
 *
 * The comparison is `<=`, so equal bounds are refused as well — a range that
 * admits exactly one duration is not a range, and the rule as stated is
 * *greater than*.
 *
 * A `400` rather than a `409`: nothing stored conflicts with this request, the
 * submitted body simply contradicts itself. The message is an array, the same
 * shape the `ValidationPipe` produces, so a form handles it with the code it
 * already has for field errors.
 */
function assertEntryRangeIsOrdered({
  minHoursPerEntry,
  maxHoursPerEntry,
}: UpdateWorkScheduleDto): void {
  if (maxHoursPerEntry <= minHoursPerEntry) {
    throw new BadRequestException([
      'maxHoursPerEntry must be greater than minHoursPerEntry',
    ]);
  }
}
