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
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeService } from './employee.service';
import { EmployeeEntity } from './entities/employee.entity';

/**
 * `/api/v1/employees` — the prefix and the version come from `configureApp`, so
 * only the resource segment is declared here.
 *
 * Every method is a one-line delegation on purpose. Validation is the DTOs'
 * job, the success envelope is the global interceptor's, error rendering is the
 * global filter's, and everything else — including confirming that a referenced
 * user, department and position exist — is the service's; a controller that did
 * any of it here would be the one place those decisions could drift.
 *
 * Note what is *not* here: no guard, no role check, no notion of who is
 * calling. Personnel records are the most sensitive resource in the API so far
 * and will need all three, but authentication and authorization are later
 * features, and half of an access check is worse than none — it reads as
 * protection while providing none.
 *
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 */
@Controller('employees')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get()
  findAll(
    @Query() query: EmployeeQueryDto,
  ): Promise<PaginatedResult<EmployeeEntity>> {
    return this.employeeService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<EmployeeEntity> {
    return this.employeeService.findOne(id);
  }

  /** Answers 201; Nest applies it to `@Post` without a `@HttpCode`. */
  @Post()
  create(@Body() dto: CreateEmployeeDto): Promise<EmployeeEntity> {
    return this.employeeService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ): Promise<EmployeeEntity> {
    return this.employeeService.update(id, dto);
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
    return this.employeeService.remove(id);
  }
}
