import { Module } from '@nestjs/common';

import { EmployeeModule } from '../employees/employee.module';
import { LeaveRequestsModule } from '../leave-requests/leave-requests.module';
import { ProjectModule } from '../projects/project.module';
import { TimesheetManagementModule } from '../timesheet-management/timesheet-management.module';
import { WorkScheduleModule } from '../work-schedule/work-schedule.module';
import { ExcelReportRenderer } from './renderers/excel.renderer';
import { PdfReportRenderer } from './renderers/pdf.renderer';
import { ReportingController } from './reporting.controller';
import { ReportingSourceService } from './reporting-source.service';
import { ReportingService } from './reporting.service';

/**
 * The reporting feature: five predefined reports, previewed as JSON and exported
 * as PDF or Excel.
 *
 * **It owns no table and adds none.** This is the first module in the
 * application that is purely a reader — every other one owns a resource — and
 * that shape is the feature's central constraint rather than an accident.
 * Nothing here writes, and nothing is stored: no report row, no generated file
 * on disk, no cache. Each request recomputes from live data.
 *
 * The five imports, and what is taken from each:
 *
 * | Import | What is read |
 * | --- | --- |
 * | `TimesheetManagementModule` | approved hours per project and per day, and where each month stands |
 * | `LeaveRequestsModule` | approved absences with the marker each prints, and — through `WorkingDaysService` — which weekdays are worked and which days are holidays |
 * | `EmployeeModule` | the population, with the employment window each day is judged against |
 * | `ProjectModule` | the projects the two hour matrices have rows for |
 * | `WorkScheduleModule` | the company timezone, and the clock window the attendance sheet stamps a worked day with |
 *
 * Feature 030 said "Reporting will read these tables eventually and will do it
 * through `TimesheetService`" and exported nothing in advance. This is that
 * caller, and the three methods it needed were written for it: this module reads
 * `timesheets` through that service and touches no table directly, which is the
 * rule the whole project keeps.
 *
 * `PublicHolidayModule` is deliberately **not** imported although holidays decide
 * a day's class. They are reached through `WorkingDaysService`, which already
 * loads them and already knows which weekdays the company works — and Feature 031
 * extended its calculator with `isWorkingWeekday` and `isPublicHoliday` rather
 * than expanding holiday spans a third time in a third module. One source of
 * truth for "what kind of day is this", which is exactly what the day
 * classification depends on.
 *
 * `PrismaModule` is not imported: it is `@Global`, and in any case nothing here
 * would inject `PrismaService` — this module has no query of its own.
 *
 * **Two services, and the split is the same seam Feature 030 draws.**
 * `ReportingSourceService` does every query and classifies each day;
 * `ReportingService` dispatches on the report type and wires
 * sourcing → builder → renderer. The builders in between are **pure functions**:
 * resolved inputs in, a data model out, no I/O and no clock — which is what lets
 * every report's arithmetic be tested without a database, and what makes the
 * preview and both exports incapable of disagreeing.
 *
 * The two renderers are providers rather than free functions because they are
 * substantial objects with their own configuration — a font registry, a
 * worksheet layout — and because a future third format should be a provider
 * beside them rather than an import somebody adds to the service.
 *
 * **Access is `REPORTS.VIEW`, and this module registers no guard of its own.**
 * The three routes carry `@RequirePermission('REPORTS.VIEW')` and the global
 * `PermissionsGuard` from Feature 035 enforces it — so this module imports
 * nothing from the authorization or permission modules beyond that one
 * decorator, and reads no permission table. The `assertReportingAccess` domain
 * rule that stood here until then is gone rather than layered underneath, and
 * the reasoning for replacing it — including why HR is now outside the default
 * and how it can be let back in one account at a time — is on
 * `ReportingController`. `PermissionResource.REPORTS`, seeded by Feature 029 for
 * a screen this backend had not yet built, is finally what decides.
 *
 * Nothing is exported. This module is the end of the chain — nothing reads a
 * report.
 */
@Module({
  imports: [
    TimesheetManagementModule,
    LeaveRequestsModule,
    EmployeeModule,
    ProjectModule,
    WorkScheduleModule,
  ],
  controllers: [ReportingController],
  providers: [
    ReportingService,
    ReportingSourceService,
    ExcelReportRenderer,
    PdfReportRenderer,
  ],
})
export class ReportingModule {}
