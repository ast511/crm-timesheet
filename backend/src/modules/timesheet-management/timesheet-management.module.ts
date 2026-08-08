import { Module } from '@nestjs/common';

import { EmployeeModule } from '../employees/employee.module';
import { LeaveRequestsModule } from '../leave-requests/leave-requests.module';
import { NotificationDeliveryModule } from '../notification-delivery/notification-delivery.module';
import { ProjectModule } from '../projects/project.module';
import { PublicHolidayModule } from '../public-holidays/public-holiday.module';
import { WorkScheduleModule } from '../work-schedule/work-schedule.module';
import { TimesheetFillService } from './timesheet-fill.service';
import { TimesheetNotificationService } from './timesheet-notification.service';
import { TimesheetController } from './timesheet.controller';
import { TimesheetService } from './timesheet.service';

/**
 * The timesheet feature — the module the whole application has been building
 * towards.
 *
 * It is the widest import list in the project, wider than `LeaveRequestsModule`'s
 * five, and that is the honest shape of the feature rather than a smell. A
 * timesheet is the point at which six previously independent facts have to agree
 * about one day:
 *
 * | Import | What is taken from it |
 * | --- | --- |
 * | `WorkScheduleModule` | which weekdays are worked, where a week begins, the per-entry, per-day and per-week ceilings, what a full day is worth |
 * | `PublicHolidayModule` | which days the company was closed, and under which name |
 * | `LeaveRequestsModule` | which days are approved absence, and whether one is half or whole |
 * | `EmployeeModule` | the window `[hireDate, terminationDate ?? today]` a month must sit inside |
 * | `ProjectModule` | that the projects a month books hours to actually exist |
 * | `NotificationDeliveryModule` | the one way anything in this application announces anything |
 *
 * Features 016 and 017 each said that "the Timesheets module will read this
 * configuration and validate against it" and that nothing would compute against
 * it until something had a reason to. This is that something, and both of them
 * still compute nothing themselves. Feature 023 said the same about
 * `LeaveRequestsService`, and this module is the caller that turned its promise
 * into two methods.
 *
 * `PrismaModule` is not imported: it is `@Global`, so `PrismaService` is
 * injectable here without the repetition every feature module would otherwise
 * carry.
 *
 * **This module owns `timesheets` and `timesheet_entries` and reads nothing
 * else directly.** Every other table is reached through the service that owns it,
 * which is the rule the whole project keeps. None of the six imports this module
 * back, so the graph stays acyclic and no `forwardRef` is needed.
 *
 * **Two services, one controller, and the split between them is the feature's
 * central structural decision.** `TimesheetService` owns the lifecycle — the four
 * transitions, the ownership rules, the aggregates — and `TimesheetFillService`
 * owns what may go on a day. The rules are where the complexity actually is, and
 * putting them in the lifecycle service would have produced one file that both
 * moved statuses and knew how long a Tuesday is. Separated, the engine is a thing
 * that takes a plan and a set of entries and answers with problems, which is
 * testable without a database, a transition or a notification. Nothing is
 * duplicated across the seam: there is exactly one function that validates a month
 * and exactly one place that writes a status.
 *
 * `TimesheetNotificationService` is the third and the smallest. It builds the four
 * payloads and hands them to the delivery engine, and it exists as its own class
 * so that "what does this feature say, and to whom" is one file somebody can read
 * — and so that the lifecycle service holds no wording.
 *
 * **Nothing here sends an email or opens a socket**, and that is the standing rule
 * rather than a description. `NotificationDeliveryModule` is imported for
 * `NotificationDispatcher.executeEvent` alone; no `SMTP_*` variable is read here,
 * Nodemailer is not imported, and no `notifications` row is written by this
 * module. Feature 028 said its dispatcher would be reached "when the timesheet and
 * leave features want to announce something — by importing this module then", and
 * exported it for this caller.
 *
 * **No permission is checked and no guard is registered.** The ownership and role
 * rules here — an owner fills and submits, an administrator approves and rejects —
 * are domain logic in `timesheet-management.rules.ts`, not authorization: they
 * describe what a timesheet *is*, and would be true under any permission system.
 * Feature 029 built the permission catalog and enforces none of it, because
 * enforcement needs authentication first; this module follows that and adds no
 * `@RequirePermission` of its own. `PermissionResource.TIMESHEET` is already
 * seeded and waiting.
 *
 * **`TimesheetService` is exported, as of Feature 031.** This module said
 * "Reporting will read these tables eventually and will do it through
 * `TimesheetService`, but writing a method for a caller that does not exist would
 * be designing the seam around a guess" — and declined to export anything. That
 * caller now exists, and the three methods it needed were written for it rather
 * than in advance: `findApprovedProjectHours`, `findApprovedDailyHours` and
 * `findStatesForPeriod`. Nothing else about this module changed; the reporting
 * module reads and no report writes a timesheet, moves a status or touches an
 * entry.
 */
@Module({
  imports: [
    WorkScheduleModule,
    PublicHolidayModule,
    LeaveRequestsModule,
    EmployeeModule,
    ProjectModule,
    NotificationDeliveryModule,
  ],
  controllers: [TimesheetController],
  providers: [
    TimesheetService,
    TimesheetFillService,
    TimesheetNotificationService,
  ],
  exports: [TimesheetService],
})
export class TimesheetManagementModule {}
