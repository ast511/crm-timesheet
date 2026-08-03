import { Module } from '@nestjs/common';

import { EmployeeModule } from '../employees/employee.module';
import { ProjectModule } from '../projects/project.module';
import { EmployeeProjectsController } from './employee-projects.controller';
import { ProjectMemberService } from './project-member.service';
import { ProjectMembersController } from './project-members.controller';

/**
 * The project-members feature.
 *
 * `PrismaModule` is not imported: it is `@Global`, so `PrismaService` is
 * injectable here without the repetition every feature module would otherwise
 * carry. The other two *are* imported, because this is the module that finally
 * uses what they export — `ProjectModule` and `EmployeeModule` each documented,
 * when they were written, that project memberships should confirm a referenced
 * row through their service rather than query its table directly. Neither
 * imports this module back, so the graph stays acyclic.
 *
 * This is the first module that is a join rather than a table: it owns no
 * resource of its own, only the relationship between two that already existed.
 *
 * `ProjectMemberService` is exported for the same reason the others export
 * theirs: time entries hang off a membership — an hour is logged by a person
 * against a project they are on — and that feature will need to confirm one
 * exists before recording anything against it.
 */
@Module({
  imports: [ProjectModule, EmployeeModule],
  // Two controllers, no top-level path of its own. Memberships are a
  // sub-resource of a project (read and write) and a read-only view on an
  // employee, so both live under paths the other two modules own — declared
  // here, because declaring them there would each require a circular import.
  // Feature 015 removed the third, `/api/v1/project-members`.
  controllers: [ProjectMembersController, EmployeeProjectsController],
  providers: [ProjectMemberService],
  exports: [ProjectMemberService],
})
export class ProjectMemberModule {}
