import type { Weekday } from '../../../generated/prisma/enums';
import {
  IsHours,
  IsLunchBreakHours,
  IsWeeklyHours,
  IsWorkingDays,
  IsWorkTime,
} from './work-schedule-field.decorators';

/**
 * Body of `PUT /api/v1/work-schedule`.
 *
 * **Every field is required**, and that is what makes the verb a `PUT` rather
 * than a `PATCH`: the body is the complete configuration, and what is stored
 * afterwards is exactly what was sent. A partial body is rejected, so there is
 * no request that leaves the schedule half-updated and no need to reason about
 * which fields the previous administrator happened to set.
 *
 * That completeness is also why the one cross-field rule —
 * `maxHoursPerEntry > minHoursPerEntry` — could have lived here. It is in the
 * service instead, beside the other rules about the configuration as a whole,
 * so there is one place to look for "what does this module refuse", and so it
 * stays testable without a `ValidationPipe`.
 *
 * There is no `CreateWorkScheduleDto`. Creating and updating take the identical
 * body — the configuration either exists or it does not, and the caller neither
 * knows nor needs to — so a second class would only be the first one under a
 * different name.
 *
 * Unknown properties never reach it: the global `ValidationPipe` runs with
 * `forbidNonWhitelisted`, so a typo in a payload is a 400 rather than a
 * silently ignored field.
 */
export class UpdateWorkScheduleDto {
  /** Distinct weekdays, stored in week order however they were submitted. */
  @IsWorkingDays()
  readonly workingDays!: Weekday[];

  /** `09:00` — when the office opens. */
  @IsWorkTime()
  readonly workStartTime!: string;

  /** `18:00` — when it closes. May be earlier than the start; see the rule. */
  @IsWorkTime()
  readonly workEndTime!: string;

  /** The smallest bookable entry, `0.5` for half an hour. */
  @IsHours()
  readonly minHoursPerEntry!: number;

  /** The largest single entry. Must exceed `minHoursPerEntry`. */
  @IsHours()
  readonly maxHoursPerEntry!: number;

  /** The ceiling across every entry on one day. */
  @IsHours()
  readonly maxHoursPerDay!: number;

  /** What a full day is expected to add up to. */
  @IsHours()
  readonly standardHoursPerDay!: number;

  /** What a full week is expected to add up to. */
  @IsWeeklyHours()
  readonly standardHoursPerWeek!: number;

  /**
   * The company's lunch break, in hours. `0` is a valid answer.
   *
   * Recorded only. Nothing subtracts it, and the Timesheets module will ignore
   * it — see the note on `WorkScheduleService`.
   */
  @IsLunchBreakHours()
  readonly lunchBreakHours!: number;
}
