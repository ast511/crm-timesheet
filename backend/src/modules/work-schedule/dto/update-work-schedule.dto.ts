import { IsOptional } from 'class-validator';

import { Weekday } from '../../../generated/prisma/enums';
import {
  IsHours,
  IsLunchBreakHours,
  IsWeekStartsOn,
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
  /**
   * Distinct weekdays, stored in week order however they were submitted.
   *
   * **This is the only statement about which days are worked.** A company that
   * works Saturdays lists Saturday; one that works Monday to Sunday lists all
   * seven, and the Timesheets module then lets every day of the week be logged.
   * Nothing anywhere excludes a weekend by name.
   */
  @IsWorkingDays()
  readonly workingDays!: Weekday[];

  /**
   * Which weekday the working week begins on. Defaults to `MONDAY`.
   *
   * **The one optional field on this DTO**, which is a deliberate exception to
   * the "every field is required" rule above, and the exception is the migration
   * rather than the design: this column arrived with Feature 030, and a `PUT`
   * written against the previous contract must not start failing because a field
   * nobody knew about is now compulsory. The initialiser supplies what the column
   * defaults to, so an old body and a new one store the same thing.
   *
   * It is configuration and not a constant because the working week does not
   * begin on Monday everywhere this application may be deployed — Sunday is the
   * first working day across much of the Middle East and in parts of Asia and the
   * Americas. It is read only by the Timesheets module's *weekly* hour ceiling,
   * which has to know where one week ends and the next begins; a Monday assumed
   * in that grouping would split such a company's week in two and let the ceiling
   * be exceeded without anything noticing.
   *
   * It is independent of {@link workingDays} and cannot be derived from it: a
   * company working Sunday to Thursday and one working Tuesday to Saturday both
   * have a first *listed* day that says nothing about which day their week turns
   * over on.
   */
  @IsOptional()
  @IsWeekStartsOn()
  readonly weekStartsOn: Weekday = Weekday.MONDAY;

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
