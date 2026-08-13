import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ApiCreatedEnvelope,
  ApiOkEnvelope,
  ApiOkNullEnvelope,
} from '../../common/swagger/api-envelope-response.decorator';
import { ApiStandardErrors } from '../../common/swagger/api-standard-errors.decorator';
import { API_TAG } from '../../config/swagger-tags';
import { BEARER_AUTH_NAME } from '../../config/swagger.setup';
import { CreateProjectMemberDto } from './dto/create-project-member.dto';
import { ProjectMemberQueryDto } from './dto/project-member-query.dto';
import { UpdateProjectMemberDto } from './dto/update-project-member.dto';
import { ProjectMemberRosterEntry } from './entities/project-member.entity';
import { ProjectRosterEntity } from './entities/project-roster.entity';
import { ProjectMemberService } from './project-member.service';

/**
 * `/api/v1/projects/:projectId/members` — a project's team, and every operation
 * on it.
 *
 * Memberships are a **sub-resource of a project**, not a top-level collection.
 * Feature 015 made that the whole story: `/api/v1/project-members` is gone, and
 * with it the last endpoint whose response repeated something the caller had
 * just supplied. Every route here is scoped by the path, so no payload carries
 * the project back.
 *
 * That is also why nothing returns the project alongside a member. The list
 * publishes it once beside the roster; the item routes do not publish it at
 * all, because `:projectId` is right there in the URL the client just wrote.
 *
 * Declared in `ProjectMemberModule` rather than on `ProjectController`, even
 * though the path sits under `projects`: putting it there would make
 * `ProjectModule` depend on `ProjectMemberModule`, which already depends on
 * `ProjectModule`. Only a `forwardRef` could break that cycle, and a
 * `forwardRef` is a note that the layering is wrong rather than a fix for it.
 *
 * Nest resolves `/projects/:id` and `/projects/:projectId/members` by segment
 * count, so this controller and `ProjectController` do not collide —
 * `routing.spec.ts` checks it against a real application.
 *
 * Every method is a one-line delegation on purpose. Validation is the DTOs'
 * job, the success envelope is the global interceptor's, error rendering is the
 * global filter's, and every rule is the service's.
 *
 * Note what is *not* here: no guard, no role check, no notion of who is
 * calling. Authentication and authorization are later features, and half of an
 * access check is worse than none.
 *
 * Both ids are taken as plain strings: they are cuids, so `ParseUUIDPipe` would
 * reject valid ones.
 */
@ApiTags(API_TAG.ProjectMembers)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors()
@Controller('projects')
export class ProjectMembersController {
  constructor(private readonly projectMemberService: ProjectMemberService) {}

  /**
   * The roster: the project once, then its people.
   *
   * Answers `404` when the project does not exist — it is the resource being
   * addressed, not a filter that happens to match nothing.
   */
  @ApiOperation({
    summary: 'Read a project’s roster',
    description:
      'The project once, then its people — no row repeats the project the URL already named. A `404` here means the *project* does not exist; an empty roster is a `200` with an empty list.',
  })
  @ApiOkEnvelope(ProjectRosterEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  @Get(':projectId/members')
  findRoster(
    @Param('projectId') projectId: string,
    @Query() query: ProjectMemberQueryDto,
  ): Promise<ProjectRosterEntity> {
    return this.projectMemberService.findRoster(projectId, query);
  }

  @ApiOperation({
    summary: 'Read one membership',
    description:
      'The person and the membership. No `project` in the payload — `:projectId` is in the URL the client just wrote.',
  })
  @ApiOkEnvelope(ProjectMemberRosterEntry)
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
  @Get(':projectId/members/:employeeId')
  findOne(
    @Param('projectId') projectId: string,
    @Param('employeeId') employeeId: string,
  ): Promise<ProjectMemberRosterEntry> {
    return this.projectMemberService.findOne(projectId, employeeId);
  }

  /**
   * Adds somebody to this project. Answers 201; Nest applies it to `@Post`
   * without a `@HttpCode`.
   *
   * The project comes from the path and only `employeeId` from the body, which
   * is the shape the URL already implies — and it is what lets an unknown
   * project be a `404` (the collection is not there) while an unknown employee
   * stays a `400` (the payload is wrong).
   */
  @ApiOperation({
    summary: 'Add somebody to a project',
    description:
      'The project comes from the path and only `employeeId` from the body. That is what lets an unknown *project* be a `404` — the collection is not there — while an unknown *employee* stays a `400`, because the payload is wrong.',
  })
  @ApiCreatedEnvelope(ProjectMemberRosterEntry)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  @Post(':projectId/members')
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectMemberDto,
  ): Promise<ProjectMemberRosterEntry> {
    return this.projectMemberService.create(projectId, dto);
  }

  @ApiOperation({
    summary: 'Update a membership',
    description:
      'A partial update of the membership period and the project-manager flag. `leftAt`, when given, must be on or after `joinedAt`.',
  })
  @ApiOkEnvelope(ProjectMemberRosterEntry)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  @Patch(':projectId/members/:employeeId')
  update(
    @Param('projectId') projectId: string,
    @Param('employeeId') employeeId: string,
    @Body() dto: UpdateProjectMemberDto,
  ): Promise<ProjectMemberRosterEntry> {
    return this.projectMemberService.update(projectId, employeeId, dto);
  }

  /**
   * Answers 200 with `{ "success": true, "data": null }` rather than 204.
   *
   * A 204 would have to carry an empty body, making this the one endpoint whose
   * response is not the envelope — Feature 006 chose the explicit `data: null`
   * so a client reads the same two fields whatever it called.
   */
  @ApiOperation({
    summary: 'Remove somebody from a project',
    description: 'Answers `200` with `data: null` rather than `204`.',
  })
  @ApiOkNullEnvelope()
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
  @Delete(':projectId/members/:employeeId')
  remove(
    @Param('projectId') projectId: string,
    @Param('employeeId') employeeId: string,
  ): Promise<void> {
    return this.projectMemberService.remove(projectId, employeeId);
  }
}
