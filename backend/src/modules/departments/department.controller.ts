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
 *
 * The `@Api*` decorators added by Feature 038 describe this controller and
 * change nothing about it. `@ApiStandardErrors()` on the class is the `401`,
 * `429` and `500` every route here can answer; each method adds only the
 * failures it can actually produce.
 */
@ApiTags(API_TAG.Departments)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors()
@Controller('departments')
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @ApiOperation({
    summary: 'List departments',
    description:
      'Paginated, filterable and sortable. Ordered by `name` by default, which is unique — so the order is total and a record can never shift between two pages of the same listing.',
  })
  @ApiOkPageEnvelope(DepartmentEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Get()
  findAll(
    @Query() query: DepartmentQueryDto,
  ): Promise<PaginatedResult<DepartmentEntity>> {
    return this.departmentService.findAll(query);
  }

  @ApiOperation({ summary: 'Read one department' })
  @ApiOkEnvelope(DepartmentEntity)
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
  @Get(':id')
  findOne(@Param('id') id: string): Promise<DepartmentEntity> {
    return this.departmentService.findOne(id);
  }

  /** Answers 201; Nest applies it to `@Post` without a `@HttpCode`. */
  @ApiOperation({
    summary: 'Create a department',
    description:
      '`code` is trimmed and upper-cased before the uniqueness check, so `dev` and `DEV` are the same department.',
  })
  @ApiCreatedEnvelope(DepartmentEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT)
  @Post()
  create(@Body() dto: CreateDepartmentDto): Promise<DepartmentEntity> {
    return this.departmentService.create(dto);
  }

  @ApiOperation({
    summary: 'Update a department',
    description:
      'A partial update: only the fields present in the body are changed.',
  })
  @ApiOkEnvelope(DepartmentEntity)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
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
  @ApiOperation({
    summary: 'Delete a department',
    description:
      'Refused with a `409` while any employee still belongs to it. Answers `200` with `data: null` rather than `204`, so a client reads the same two fields whatever it called.',
  })
  @ApiOkNullEnvelope()
  @ApiStandardErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.departmentService.remove(id);
  }
}
