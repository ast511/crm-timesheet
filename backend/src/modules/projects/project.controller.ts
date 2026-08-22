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

import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import {
  ApiCreatedEnvelope,
  ApiOkEnvelope,
  ApiOkNullEnvelope,
  ApiOkPageEnvelope,
} from '../../common/swagger/api-envelope-response.decorator';
import { ApiStandardErrors } from '../../common/swagger/api-standard-errors.decorator';
import { API_TAG } from '../../config/swagger-tags';
import { BEARER_AUTH_NAME } from '../../config/swagger.setup';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectEntity } from './entities/project.entity';
import { ProjectService } from './project.service';

/**
 * `/api/v1/projects` — the prefix and the version come from `configureApp`, so
 * only the resource segment is declared here.
 *
 * Every method is a one-line delegation on purpose. Validation is the DTOs'
 * job, the success envelope is the global interceptor's, error rendering is the
 * global filter's, and everything else — the code's uniqueness, the ordering of
 * the two dates, the refusal to delete a project people are on — is the
 * service's; a controller that did any of it here would be the one place those
 * decisions could drift.
 *
 * ## The three writes are gated; the two reads are not
 *
 * Feature 041 closed the gap this controller's own comment used to describe.
 * `POST`, `PATCH` and `DELETE` carry `PROJECTS.CREATE`, `PROJECTS.EDIT` and
 * `PROJECTS.DELETE` — the catalog's own keys for this resource, and the ones the
 * `Admin - Standard` baseline already grants for the first two. A plain employee
 * holds no `PROJECTS.*` key at all, so a direct `POST /api/v1/projects` from a
 * screen that hides its own "New project" button is now a `403` rather than a
 * project.
 *
 * **`GET /projects` stays ungated, and that is load-bearing rather than an
 * oversight.** Every employee filling in a timesheet picks from this list, and
 * since the `USER` baseline dropped `PROJECTS.VIEW` — see the amendment note in
 * `permission-sets.ts` — the *only* thing keeping the picker working is that this
 * route declares no requirement. `authorization/routing.spec.ts` asserts it, so
 * gating it later would be a failing test rather than a support ticket. What the
 * employee loses without `PROJECTS.PAGE_ACCESS` is the standalone *Proiecte*
 * screen, and only that.
 *
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 */
@ApiTags(API_TAG.Projects)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors()
@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @ApiOperation({
    summary: 'List projects',
    description: 'Paginated, filterable and sortable.',
  })
  @ApiOkPageEnvelope(ProjectEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Get()
  findAll(
    @Query() query: ProjectQueryDto,
  ): Promise<PaginatedResult<ProjectEntity>> {
    return this.projectService.findAll(query);
  }

  @ApiOperation({ summary: 'Read one project' })
  @ApiOkEnvelope(ProjectEntity)
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
  @Get(':id')
  findOne(@Param('id') id: string): Promise<ProjectEntity> {
    return this.projectService.findOne(id);
  }

  /** Answers 201; Nest applies it to `@Post` without a `@HttpCode`. */
  @ApiOperation({
    summary: 'Create a project',
    description:
      '`code` is trimmed and upper-cased before the uniqueness check. `endDate`, when given, must be on or after `startDate`.',
  })
  @ApiCreatedEnvelope(ProjectEntity)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.CONFLICT,
  )
  @Post()
  @RequirePermission('PROJECTS.CREATE')
  create(@Body() dto: CreateProjectDto): Promise<ProjectEntity> {
    return this.projectService.create(dto);
  }

  @ApiOperation({
    summary: 'Update a project',
    description:
      'A partial update. The date ordering is re-checked against the values already stored, not only against the ones in the body.',
  })
  @ApiOkEnvelope(ProjectEntity)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  @Patch(':id')
  @RequirePermission('PROJECTS.EDIT')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectEntity> {
    return this.projectService.update(id, dto);
  }

  /**
   * Answers 200 with `{ "success": true, "data": null }` rather than 204.
   *
   * A 204 would have to carry an empty body, making this the one endpoint whose
   * response is not the envelope — Feature 006 chose the explicit `data: null`
   * so a client reads the same two fields whatever it called.
   */
  @ApiOperation({
    summary: 'Delete a project',
    description:
      'Refused with a `409` while anybody is still a member of it. Answers `200` with `data: null` rather than `204`.',
  })
  @ApiOkNullEnvelope()
  @ApiStandardErrors(
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  @Delete(':id')
  @RequirePermission('PROJECTS.DELETE')
  remove(@Param('id') id: string): Promise<void> {
    return this.projectService.remove(id);
  }
}
