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
import { DepartmentService } from './department.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { DepartmentQueryDto } from './dto/department-query.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { DepartmentEntity } from './entities/department.entity';

/**
 * `/api/v1/departments` — the prefix and the version come from `configureApp`,
 * so only the resource segment is declared here.
 *
 * Every method is a one-line delegation on purpose. Validation is the DTOs'
 * job, the success envelope is the global interceptor's, error rendering is the
 * global filter's, and everything else is the service's; a controller that did
 * any of it here would be the one place those decisions could drift.
 *
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 */
@Controller('departments')
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Get()
  findAll(
    @Query() query: DepartmentQueryDto,
  ): Promise<PaginatedResult<DepartmentEntity>> {
    return this.departmentService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<DepartmentEntity> {
    return this.departmentService.findOne(id);
  }

  /** Answers 201; Nest applies it to `@Post` without a `@HttpCode`. */
  @Post()
  create(@Body() dto: CreateDepartmentDto): Promise<DepartmentEntity> {
    return this.departmentService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ): Promise<DepartmentEntity> {
    return this.departmentService.update(id, dto);
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
    return this.departmentService.remove(id);
  }
}
