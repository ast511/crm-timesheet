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

import { CurrentEmployeeId } from '../../common/decorators/current-employee-id.decorator';
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
 * Who "me" is comes from `@CurrentEmployeeId()`. That was a placeholder reading
 * an `x-employee-id` header any caller could set, kept to a single decorator so
 * that the day authentication landed, nothing in this file would change.
 * Feature 032 landed it, and nothing in this file changed — see the decorator,
 * which quotes the promise back. The employee is now the employment record of
 * the account behind a validated access token.
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
@ApiTags(API_TAG.LeaveRequests)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors(HttpStatus.FORBIDDEN)
@Controller('me/leave-requests')
export class MyLeaveRequestsController {
  constructor(private readonly leaveRequestsService: LeaveRequestsService) {}

  /** Every row carries a computed `requestedWorkingDays`; none is stored. */
  @ApiOperation({
    summary: 'List my leave requests',
    description:
      '"Me" is the employment record of the authenticated account — there is no id in this path, which is what makes `/me` the one scope that cannot be aimed at somebody else. The payloads carry no `employee`, because a response must not repeat what the caller already stated. An account with no employment record gets a `403` carrying `AUTH_NO_EMPLOYEE_RECORD`. `requestedWorkingDays` is computed on every read from the schedule, the holidays and the span.',
  })
  @ApiOkPageEnvelope(MyLeaveRequestEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Get()
  findAll(
    @CurrentEmployeeId() employeeId: string,
    @Query() query: MyLeaveRequestQueryDto,
  ): Promise<PaginatedResult<MyLeaveRequestEntity>> {
    return this.leaveRequestsService.findOwn(employeeId, query);
  }

  /** Somebody else's request answers the same 404 as one that does not exist. */
  @ApiOperation({
    summary: 'Read one of my leave requests',
    description:
      'Somebody else’s request answers the same `404` as one that does not exist, so this endpoint cannot be used to discover that a request exists.',
  })
  @ApiOkEnvelope(MyLeaveRequestEntity)
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
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
  @ApiOperation({
    summary: 'File a leave request',
    description:
      'The response’s `status` is `PENDING` or `APPROVED` depending on the leave type — a type that requires no approval is granted here and now, and its days leave the balance in the same transaction. At least one replacement is required: the API refuses a request with no cover. The span rules, the overlap check and the balance check are the service’s and answer `400`.',
  })
  @ApiCreatedEnvelope(MyLeaveRequestEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT)
  @Post()
  create(
    @CurrentEmployeeId() employeeId: string,
    @Body() dto: CreateLeaveRequestDto,
  ): Promise<MyLeaveRequestEntity> {
    return this.leaveRequestsService.createOwn(employeeId, dto);
  }

  /** Allowed only while the request is `PENDING`; otherwise a 409. */
  @ApiOperation({
    summary: 'Amend one of my leave requests',
    description:
      'Allowed only while the request is `PENDING`; once it has been decided on, it is a record of something that happened and answers `409`.',
  })
  @ApiOkEnvelope(MyLeaveRequestEntity)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
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
  @ApiOperation({
    summary: 'Withdraw one of my leave requests',
    description:
      'A hard delete, and only while the request is `PENDING`. A decided request is not withdrawn but cancelled, which is the approver’s action. Answers `200` with `data: null` rather than `204`.',
  })
  @ApiOkNullEnvelope()
  @ApiStandardErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  @Delete(':id')
  remove(
    @CurrentEmployeeId() employeeId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.leaveRequestsService.removeOwn(employeeId, id);
  }
}
