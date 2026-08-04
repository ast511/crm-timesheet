import { Module } from '@nestjs/common';

import { WorkScheduleController } from './work-schedule.controller';
import { WorkScheduleService } from './work-schedule.service';

/**
 * The work-schedule feature.
 *
 * `PrismaModule` is not imported: it is `@Global`, so `PrismaService` is
 * injectable here without the repetition every feature module would otherwise
 * carry. Nothing else is imported either — the configuration references no
 * department, employee or project, which is what makes this module a leaf of
 * the graph rather than a node in it.
 *
 * `WorkScheduleService` is exported because the whole point of the feature is
 * that something else reads it: the Timesheets module will validate an entry
 * against the configured days, the entry bounds and the daily ceiling, and it
 * should ask this service for them rather than querying `work_schedules`
 * itself — the same hand-off `ProjectService` and `EmployeeService` make.
 */
@Module({
  controllers: [WorkScheduleController],
  providers: [WorkScheduleService],
  exports: [WorkScheduleService],
})
export class WorkScheduleModule {}
