import { Controller, Get, Param, Query } from '@nestjs/common';

import { ProjectMemberQueryDto } from './dto/project-member-query.dto';
import { EmployeeProjectsEntity } from './entities/employee-projects.entity';
import { ProjectMemberService } from './project-member.service';

/**
 * `/api/v1/employees/:employeeId/projects` — one person and what they work on.
 *
 * The read-only mirror of `ProjectMembersController`, declared here for the
 * same reason:
 * putting it on `EmployeeController` would make `EmployeeModule` depend on
 * `ProjectMemberModule`, which already depends on `EmployeeModule`. Declared in
 * this module, the graph stays acyclic and the module that owns memberships
 * owns every route that returns them.
 *
 * Nest resolves `/employees/:id` and `/employees/:employeeId/projects` by
 * segment count, so the two controllers do not collide —
 * `project-roster.routing.spec.ts` checks both pairs against a real
 * application.
 *
 * This endpoint replaces `/project-members?employeeId=…`, which answered the
 * same question by repeating the same person on every row. That filter is gone.
 */
@Controller('employees')
export class EmployeeProjectsController {
  constructor(private readonly projectMemberService: ProjectMemberService) {}

  /**
   * Answers `404` when the employee does not exist, which is what a scoped URL
   * buys over the filter it replaces: there an unknown id honestly matched
   * nothing and returned an empty page, here it addresses a resource.
   */
  @Get(':employeeId/projects')
  findAssignments(
    @Param('employeeId') employeeId: string,
    @Query() query: ProjectMemberQueryDto,
  ): Promise<EmployeeProjectsEntity> {
    return this.projectMemberService.findAssignments(employeeId, query);
  }
}
