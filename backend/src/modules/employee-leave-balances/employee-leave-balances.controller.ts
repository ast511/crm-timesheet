import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import { CreateEmployeeLeaveBalanceDto } from './dto/create-employee-leave-balance.dto';
import { EmployeeLeaveBalanceQueryDto } from './dto/employee-leave-balance-query.dto';
import { GenerateLeaveBalancesDto } from './dto/generate-leave-balances.dto';
import { UpdateEmployeeLeaveBalanceDto } from './dto/update-employee-leave-balance.dto';
import { EmployeeLeaveBalancesService } from './employee-leave-balances.service';
import { EmployeeLeaveBalanceEntity } from './entities/employee-leave-balance.entity';
import { LeaveBalanceGenerationReport } from './entities/leave-balance-generation-report.entity';

/**
 * `/api/v1/employee-leave-balances` — how much leave each person has, of each
 * kind, in each year. The prefix and the version come from `configureApp`, so
 * only the resource segment is declared here.
 *
 * A top-level collection rather than `/employees/:id/leave-balances`, which
 * Feature 015 might suggest. The reason is what the endpoint is *for*: the
 * primary screen is HR's, and it reads across people — "everyone's 2026 annual
 * leave", sorted by employee, filtered by department. A nested URL would make
 * that the one question the API could not answer without a request per
 * employee, while the per-employee view remains available here as
 * `?search=EMP-0001`. Feature 015's rule was that a scope in the path must not
 * *also* be a filter; it did not say every relation must become a path.
 *
 * Every method is a one-line delegation on purpose. Validation is the DTOs' job,
 * the success envelope is the global interceptor's, error rendering is the
 * global filter's, and everything else — the referenced rows, the duplicate
 * triple, and the `remainingDays` arithmetic — is the service's.
 *
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 *
 * Note what is *not* here: no guard, no role check, no notion of who is calling,
 * even though allocating leave is an HR/Admin action in practice. Authentication
 * and authorization are later features, and half of an access check is worse
 * than none — it reads as protection while providing none.
 */
@Controller('employee-leave-balances')
export class EmployeeLeaveBalancesController {
  constructor(
    private readonly employeeLeaveBalancesService: EmployeeLeaveBalancesService,
  ) {}

  /** Every balance carries a computed `remainingDays`; none is stored. */
  @Get()
  findAll(
    @Query() query: EmployeeLeaveBalanceQueryDto,
  ): Promise<PaginatedResult<EmployeeLeaveBalanceEntity>> {
    return this.employeeLeaveBalancesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<EmployeeLeaveBalanceEntity> {
    return this.employeeLeaveBalancesService.findOne(id);
  }

  /** Answers 201; Nest applies it to `@Post` without a `@HttpCode`. */
  @Post()
  create(
    @Body() dto: CreateEmployeeLeaveBalanceDto,
  ): Promise<EmployeeLeaveBalanceEntity> {
    return this.employeeLeaveBalancesService.create(dto);
  }

  /**
   * Opens a year for everybody in scope, and closes the one before it.
   *
   * A `POST` to a named sub-path rather than a resource, because what it creates
   * is not one balance — it is however many the scope works out to, and the
   * response is a report on the run rather than a record a client could then
   * `GET`. The rows themselves stay addressable where they always were:
   * `GET /employee-leave-balances?year=2027`.
   *
   * Answers `200` rather than `201`, and the override is the honest code. A
   * `Location` header would have nothing to point at, a re-run that creates
   * nothing is a complete success, and `dryRun` writes nothing at all — none of
   * which `201 Created` describes.
   */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  generate(
    @Body() dto: GenerateLeaveBalancesDto,
  ): Promise<LeaveBalanceGenerationReport> {
    return this.employeeLeaveBalancesService.generate(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeLeaveBalanceDto,
  ): Promise<EmployeeLeaveBalanceEntity> {
    return this.employeeLeaveBalancesService.update(id, dto);
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
    return this.employeeLeaveBalancesService.remove(id);
  }
}
