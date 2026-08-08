import { Module } from '@nestjs/common';

import { EmployeeLeaveBalancesModule } from '../employee-leave-balances/employee-leave-balances.module';
import { EmployeeModule } from '../employees/employee.module';
import { LeaveConfigurationModule } from '../leave-configuration/leave-configuration.module';
import { PublicHolidayModule } from '../public-holidays/public-holiday.module';
import { WorkScheduleModule } from '../work-schedule/work-schedule.module';
import { LeaveRequestsController } from './leave-requests.controller';
import { LeaveRequestsService } from './leave-requests.service';
import { MyLeaveRequestsController } from './my-leave-requests.controller';
import { WorkingDaysService } from './working-days.service';

/**
 * The leave-requests feature — the module that finally joins the leave area up.
 *
 * `PrismaModule` is not imported: it is `@Global`, so `PrismaService` is
 * injectable here without the repetition every feature module would otherwise
 * carry. The other five *are* imported, and this is the widest import list in
 * the project — which is the honest shape of the feature rather than a smell. A
 * leave request is the point where five previously independent facts have to
 * agree:
 *
 * - **`EmployeeModule`** — who is asking, and who is covering.
 * - **`LeaveConfigurationModule`** — what kind of leave it is, and whether it
 *   needs approving. `LeaveTypesService.findPolicy` is the hand-off Feature 021
 *   said this module would use.
 * - **`EmployeeLeaveBalancesModule`** — how many days the person has, and the
 *   only writer of `used_days`. Feature 022 exported its service for this
 *   caller and deliberately wrote no method in advance; `findAvailable`,
 *   `countAvailableDays` and `consume` are what that caller turned out to need.
 * - **`WorkScheduleModule`** and **`PublicHolidayModule`** — which days are
 *   worked and which are not, together the whole of the working-day count.
 *   Features 016 and 017 each said something would eventually compute against
 *   their configuration; this is that something, and both still compute nothing
 *   themselves.
 *
 * None of the five imports this module back, so the graph stays acyclic and no
 * `forwardRef` is needed. That is not an accident: this module reads four of
 * them and writes exactly one table it does not own — `employee_leave_balances`
 * — and it does that *through the owning service* rather than by reaching into
 * the table, which is what keeps the dependency one-directional.
 *
 * **Two controllers, one service.** `/me/leave-requests` and `/leave-requests`
 * answer genuinely different questions — one is the employee's own screen, the
 * other reads across people and decides — and their payloads differ, so they are
 * two files. The rules they enforce are the same rules, so there is one service:
 * splitting it would have given the overlap check, the working-day count and the
 * balance arithmetic two homes.
 *
 * `WorkingDaysService` is a provider of this module rather than of
 * `WorkScheduleModule`, on the same principle Feature 016 stated: that module
 * configures, and the feature with a reason to count does the counting.
 *
 * **It is exported as of Feature 031.** This module said it would not be exported
 * "before there is a second caller", because that would be guessing at what the
 * caller needs. Reporting is that caller, and it turned out to need something the
 * guess would have missed: not the counting at all, but the two *facts underneath*
 * it. `isWorkingDay` folds "this weekday is not worked" and "the company was
 * closed" into one boolean, which is right for counting a leave span and useless
 * for a report that prints `L` on one and `S` on the other. So the calculator
 * gained `isWorkingWeekday` and `isPublicHoliday`, with `isWorkingDay` now
 * visibly derived from them — and reporting reads holidays through here rather
 * than importing `PublicHolidayModule` and expanding the spans a third time.
 *
 * `LeaveRequestsService` is exported because the notifications feature will have
 * to know when a request changes state, and reporting will read across
 * absences — the same hand-off every module here makes. No method is written for
 * either in advance.
 *
 * **What this module does not do**, and will not: it sends no email, checks no
 * permission, notifies nobody and produces no report. Those are later features.
 */
@Module({
  imports: [
    EmployeeModule,
    LeaveConfigurationModule,
    EmployeeLeaveBalancesModule,
    WorkScheduleModule,
    PublicHolidayModule,
  ],
  controllers: [MyLeaveRequestsController, LeaveRequestsController],
  providers: [LeaveRequestsService, WorkingDaysService],
  exports: [LeaveRequestsService, WorkingDaysService],
})
export class LeaveRequestsModule {}
