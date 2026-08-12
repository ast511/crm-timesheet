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

import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
 * **Access is still unchanged from Feature 010**, deliberately: no guard and no
 * role check on any route here. Managing employees is HR's job as much as an
 * administrator's, and Feature 035's gating model is opt-in — a route is gated
 * when its permission key exists and the team decides — so these keep the domain
 * rules they have always had. `EMPLOYEES.*` is seeded and waiting.
 *
 * The one exception is the account opt-in Feature 036 added to `create`, and it
 * is an exception about the *body* rather than the route: creating an employee is
 * HR's job and creating a login is not, so a body carrying `account` is refused
 * for anybody who is not `ADMIN` or `SUPERADMIN`. That check could not have been
 * a route-level gate and lives in the service — see `assertAccountAdministrator`.
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

  /**
   * Creates an employee, optionally with the login account to go with it.
   *
   * Answers 201; Nest applies it to `@Post` without a `@HttpCode`.
   *
   * The caller is read here **only** because of the account opt-in: creating an
   * employee is HR's job and creating a login is not, so a body carrying
   * `account` is refused for anybody who is not `ADMIN` or `SUPERADMIN`. That
   * check could not have been a route-level gate — whether this request
   * administers an account depends on its body — so it lives in the service
   * beside the other statements about what a valid creation is. Employee
   * creation without the opt-in is unchanged and unrestricted, exactly as before
   * Feature 036.
   */
  @Post()
  create(
    @CurrentUser() user: CurrentUser,
    @Body() dto: CreateEmployeeDto,
  ): Promise<EmployeeEntity> {
    return this.employeeService.create(user, dto);
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
