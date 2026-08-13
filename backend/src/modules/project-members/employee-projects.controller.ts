import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiOkEnvelope } from '../../common/swagger/api-envelope-response.decorator';
import { ApiStandardErrors } from '../../common/swagger/api-standard-errors.decorator';
import { API_TAG } from '../../config/swagger-tags';
import { BEARER_AUTH_NAME } from '../../config/swagger.setup';
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
@ApiTags(API_TAG.ProjectMembers)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors()
@Controller('employees')
export class EmployeeProjectsController {
  constructor(private readonly projectMemberService: ProjectMemberService) {}

  /**
   * Answers `404` when the employee does not exist, which is what a scoped URL
   * buys over the filter it replaces: there an unknown id honestly matched
   * nothing and returned an empty page, here it addresses a resource.
   */
  @ApiOperation({
    summary: 'Read an employee’s project assignments',
    description:
      'The exact mirror of a project’s roster: the employee once, then what they work on. A `404` here means the *employee* does not exist — which is what a scoped URL buys over the `?employeeId=` filter it replaced, where an unknown id honestly matched nothing and returned an empty page.',
  })
  @ApiOkEnvelope(EmployeeProjectsEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  @Get(':employeeId/projects')
  findAssignments(
    @Param('employeeId') employeeId: string,
    @Query() query: ProjectMemberQueryDto,
  ): Promise<EmployeeProjectsEntity> {
    return this.projectMemberService.findAssignments(employeeId, query);
  }
}
