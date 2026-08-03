import { Module } from '@nestjs/common';

import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';

/**
 * The projects feature.
 *
 * `PrismaModule` is not imported: it is `@Global`, so `PrismaService` is
 * injectable here without the repetition every feature module would otherwise
 * carry. Nothing else is imported either — a project stands on its own, with no
 * required relation to a department, an employee or a user, which is why this
 * module is a leaf of the graph rather than a node in it.
 *
 * `ProjectService` is exported for the same reason `DepartmentService` and
 * `PositionService` are: project memberships, time entries and reports all hang
 * off a project and will each need to confirm one exists before recording
 * anything against it — through `exists()`, rather than by reaching into the
 * `projects` table themselves.
 */
@Module({
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
