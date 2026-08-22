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

import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
 * ## Two layers on `create`, and only one on the reads
 *
 * `EMPLOYEES.*` was "seeded and waiting" from Feature 010 until Feature 041
 * spent it: `POST`, `PATCH` and `DELETE` now carry `EMPLOYEES.CREATE`,
 * `EMPLOYEES.EDIT` and `EMPLOYEES.DELETE`. HR holds the first two by baseline
 * and neither HR nor an ordinary administrator holds the third, which is the
 * line the presets were drawn on: an HR administrator *corrects* records, and
 * removing an employee other tables point at is what "Full Access" exists to
 * authorise.
 *
 * The two reads stay ungated. An employee directory is not an account list —
 * `UserController` is the one that enumerates who can sign in, and it is
 * ADMIN/SUPERADMIN-only for that reason.
 *
 * **The account opt-in Feature 036 added to `create` is untouched and still
 * runs underneath the new gate**, because it is a rule about the *body* rather
 * than the route: creating an employee is HR's job and creating a login is not,
 * so a body carrying `account` is refused for anybody who is not `ADMIN` or
 * `SUPERADMIN`. An HR user therefore clears `EMPLOYEES.CREATE` and is still
 * refused the login — see `assertAccountAdministrator`, and note that the two
 * refusals are distinguishable by their `errorCode`.
 *
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 *
 * The nested `user` on an employee is a summary that has **no `passwordHash`
 * for a mapper to copy** — see `EmployeeUserSummary` — so the documented schema
 * and the query agree by construction.
 */
@ApiTags(API_TAG.Employees)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors()
@Controller('employees')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @ApiOperation({
    summary: 'List employees',
    description:
      'Paginated, filterable and sortable. Each row carries its department, position and account summary, so a list renders without a request per employee.',
  })
  @ApiOkPageEnvelope(EmployeeEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Get()
  findAll(
    @Query() query: EmployeeQueryDto,
  ): Promise<PaginatedResult<EmployeeEntity>> {
    return this.employeeService.findAll(query);
  }

  @ApiOperation({ summary: 'Read one employee' })
  @ApiOkEnvelope(EmployeeEntity)
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
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
   * beside the other statements about what a valid creation is.
   *
   * Creating the employee itself requires `EMPLOYEES.CREATE` since Feature 041.
   * The two are independent: the gate says whether this account may add people
   * to the directory, the service rule says whether it may hand one a login.
   */
  @ApiOperation({
    summary: 'Create an employee, optionally with a login account',
    description:
      'Exactly one of `userId` (link an existing account) and `account` (create one) must be given — a rule about a *pair*, so it is the service’s rather than the validation pipe’s, and it answers `400`. A body carrying `account` is refused with a `403` for anybody who is not ADMIN or SUPERADMIN: creating an employee is HR’s job and creating a login is not. Without that opt-in the route is unrestricted, exactly as before Feature 036.',
  })
  @ApiCreatedEnvelope(EmployeeEntity)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.CONFLICT,
  )
  @Post()
  @RequirePermission('EMPLOYEES.CREATE')
  create(
    @CurrentUser() user: CurrentUser,
    @Body() dto: CreateEmployeeDto,
  ): Promise<EmployeeEntity> {
    return this.employeeService.create(user, dto);
  }

  @ApiOperation({
    summary: 'Update an employee',
    description:
      'A partial update. Moving an employee to `TERMINATED` closes their open project memberships as a side effect — see Feature 020.',
  })
  @ApiOkEnvelope(EmployeeEntity)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  @Patch(':id')
  @RequirePermission('EMPLOYEES.EDIT')
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
  @ApiOperation({
    summary: 'Delete an employee',
    description:
      'Refused with a `409` while anything still depends on the record. Answers `200` with `data: null` rather than `204`.',
  })
  @ApiOkNullEnvelope()
  @ApiStandardErrors(
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  @Delete(':id')
  @RequirePermission('EMPLOYEES.DELETE')
  remove(@Param('id') id: string): Promise<void> {
    return this.employeeService.remove(id);
  }
}
