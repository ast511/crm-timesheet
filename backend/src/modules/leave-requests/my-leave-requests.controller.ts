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

import { CurrentEmployeeId } from '../../common/decorators/current-employee-id.decorator';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { MyLeaveRequestQueryDto } from './dto/leave-request-query.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';
import { MyLeaveRequestEntity } from './entities/leave-request.entity';
import { LeaveRequestsService } from './leave-requests.service';

/**
 * `/api/v1/me/leave-requests` — one person's own leave, filed and managed by
 * them. The prefix and the version come from `configureApp`, so only the
 * resource segments are declared here.
 *
 * A `/me` scope rather than `/employees/:id/leave-requests`, which Feature 015
 * would otherwise suggest. The difference is who is asking: this is the
 * employee's own screen, and the person is not a *parameter* of it but the
 * subject — an id in the path would let anyone read anyone's leave by typing
 * one, and would make the endpoint indistinguishable from the HR list it sits
 * beside. `/me` is the one scope that cannot be aimed at somebody else.
 *
 * Who "me" is comes from the `x-employee-id` header, through
 * `@CurrentEmployeeId()`. **That is a placeholder for authentication**, kept to
 * a single decorator so the day auth lands, nothing in this file changes — see
 * the decorator for the whole argument. Any caller may claim any employee id
 * today, and pretending otherwise would be worse than saying so.
 *
 * The payloads carry no `employee` object, for the reason the URL carries no id:
 * a response must never repeat what the caller already stated. The HR
 * controller's payloads do carry one, because there the rows really are about
 * different people.
 *
 * Every method is a one-line delegation on purpose. Validation is the DTOs' job,
 * the success envelope is the global interceptor's, error rendering is the
 * global filter's, and everything else — the working-day count, the overlap, the
 * replacements, the balance — is the service's.
 *
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 */
@Controller('me/leave-requests')
export class MyLeaveRequestsController {
  constructor(private readonly leaveRequestsService: LeaveRequestsService) {}

  /** Every row carries a computed `requestedWorkingDays`; none is stored. */
  @Get()
  findAll(
    @CurrentEmployeeId() employeeId: string,
    @Query() query: MyLeaveRequestQueryDto,
  ): Promise<PaginatedResult<MyLeaveRequestEntity>> {
    return this.leaveRequestsService.findOwn(employeeId, query);
  }

  /** Somebody else's request answers the same 404 as one that does not exist. */
  @Get(':id')
  findOne(
    @CurrentEmployeeId() employeeId: string,
    @Param('id') id: string,
  ): Promise<MyLeaveRequestEntity> {
    return this.leaveRequestsService.findOwnOne(employeeId, id);
  }

  /**
   * Answers 201; Nest applies it to `@Post` without a `@HttpCode`.
   *
   * The response's `status` is `PENDING` or `APPROVED` depending on the leave
   * type — a type that requires no approval is granted here and now, and its
   * days leave the balance in the same transaction.
   */
  @Post()
  create(
    @CurrentEmployeeId() employeeId: string,
    @Body() dto: CreateLeaveRequestDto,
  ): Promise<MyLeaveRequestEntity> {
    return this.leaveRequestsService.createOwn(employeeId, dto);
  }

  /** Allowed only while the request is `PENDING`; otherwise a 409. */
  @Patch(':id')
  update(
    @CurrentEmployeeId() employeeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveRequestDto,
  ): Promise<MyLeaveRequestEntity> {
    return this.leaveRequestsService.updateOwn(employeeId, id, dto);
  }

  /**
   * Withdraws a request, hard, and only while it is `PENDING`.
   *
   * Answers 200 with `{ "success": true, "data": null }` rather than 204. A 204
   * would have to carry an empty body, making this the one endpoint whose
   * response is not the envelope — Feature 006 chose the explicit `data: null`
   * so a client reads the same two fields whatever it called.
   */
  @Delete(':id')
  remove(
    @CurrentEmployeeId() employeeId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.leaveRequestsService.removeOwn(employeeId, id);
  }
}
