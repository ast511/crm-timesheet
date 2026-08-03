import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { PaginatedResult } from '../../common/interfaces/pagination.interface';
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
 * Note what is *not* here: no guard, no role check, no notion of who is
 * calling. Authentication and authorization are later features, and half of an
 * access check is worse than none — it reads as protection while providing
 * none.
 *
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 */
@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  findAll(
    @Query() query: ProjectQueryDto,
  ): Promise<PaginatedResult<ProjectEntity>> {
    return this.projectService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<ProjectEntity> {
    return this.projectService.findOne(id);
  }

  /** Answers 201; Nest applies it to `@Post` without a `@HttpCode`. */
  @Post()
  create(@Body() dto: CreateProjectDto): Promise<ProjectEntity> {
    return this.projectService.create(dto);
  }

  @Patch(':id')
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
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.projectService.remove(id);
  }
}
