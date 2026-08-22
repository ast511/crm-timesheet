import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentEmployeeId } from '../../common/decorators/current-employee-id.decorator';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import {
  ApiOkEnvelope,
  ApiOkPageEnvelope,
} from '../../common/swagger/api-envelope-response.decorator';
import { ApiStandardErrors } from '../../common/swagger/api-standard-errors.decorator';
import { API_TAG } from '../../config/swagger-tags';
import { BEARER_AUTH_NAME } from '../../config/swagger.setup';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { LeaveRequestQueryDto } from './dto/leave-request-query.dto';
import { UpdateLeaveRequestStatusDto } from './dto/update-leave-request-status.dto';
import { LeaveRequestEntity } from './entities/leave-request.entity';
import { LeaveRequestsService } from './leave-requests.service';

/**
 * `/api/v1/leave-requests` — everybody's leave, as HR and administrators read
 * and decide it. The prefix and the version come from `configureApp`, so only
 * the resource segment is declared here.
 *
 * A top-level collection alongside the `/me` scope, and the two are not the same
 * endpoint with a different filter. This one reads *across* people — "who is off
 * in September", sorted by employee, narrowed by department — which is the one
 * question a scoped URL cannot answer without a request per employee. `/me`
 * answers the opposite question and cannot be aimed at anybody else. Feature
 * 015's rule was that a scope in the path must not *also* be a filter; here the
 * two paths are two different questions, and `?employeeId=` exists only on the
 * one where it narrows rather than scopes.
 *
 * **There is no `POST` and no `DELETE` here**, and their absence is deliberate
 * rather than pending. Leave is asked for by the person taking it, so filing on
 * somebody else's behalf would put a request in their name that they never made
 * — and deleting one would erase a record of something that happened. The only
 * write is the decision.
 *
 * **The decision requires `LEAVE_REQUESTS.APPROVE`** as of Feature 041 — the one
 * write this controller has, and the seed describes the key as "Approve or reject
 * leave, which is what moves an employee balance". It covers cancellation too:
 * all three transitions are the approver acting on somebody else's request, and
 * an employee withdrawing their own uses `DELETE /me/leave-requests/:id`
 * instead, which is gated on `LEAVE_REQUESTS.DELETE` and which the `USER`
 * baseline holds.
 *
 * `LEAVE_REQUESTS.APPROVE` is in `HR - Standard`, so approving leave stays HR's
 * job exactly as the presets intended, and it can be withdrawn from one HR
 * account or granted to one manager without a code change.
 *
 * The two reads stay ungated for now, which is a narrower statement than it
 * sounds: they read across everybody, and closing them is a `LEAVE_REQUESTS.VIEW`
 * gate that the `USER` baseline *also* holds — so it would refuse nobody while
 * looking like it did. Scoping this list to what a caller may see is a row-level
 * rule rather than a resource permission, and it is recorded as a future
 * improvement rather than papered over with a gate that admits everybody.
 *
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 */
@ApiTags(API_TAG.LeaveRequests)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors()
@Controller('leave-requests')
export class LeaveRequestsController {
  constructor(private readonly leaveRequestsService: LeaveRequestsService) {}

  /**
   * Defaults to the current year.
   *
   * The default lives in `LeaveRequestQueryDto` as a property initialiser rather
   * than here, so the service always receives a concrete year and there is never
   * more than one source for the parameter.
   */
  @ApiOperation({
    summary: 'List everybody’s leave requests',
    description:
      'The approver’s view: reads *across* people — "who is off in September", sorted by employee and narrowed by department. Defaults to the current year. Each row carries the requester and their department; `/me/leave-requests` answers the opposite question and carries neither.',
  })
  @ApiOkPageEnvelope(LeaveRequestEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Get()
  findAll(
    @Query() query: LeaveRequestQueryDto,
  ): Promise<PaginatedResult<LeaveRequestEntity>> {
    return this.leaveRequestsService.findAll(query);
  }

  @ApiOperation({ summary: 'Read one leave request' })
  @ApiOkEnvelope(LeaveRequestEntity)
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
  @Get(':id')
  findOne(@Param('id') id: string): Promise<LeaveRequestEntity> {
    return this.leaveRequestsService.findOne(id);
  }

  /**
   * Approves, refuses or cancels a request that is still `PENDING`.
   *
   * A sub-resource of its own rather than a field on a general `PATCH`, because
   * this is the only write in the API that moves another module's data:
   * approving deducts the days from the employee's balances, in the same
   * transaction. Folding it into a generic update would have made "did this
   * write touch the ledger" a question about which fields the body carried.
   *
   * The decider is taken from `@CurrentEmployeeId()` — the same seam the `/me`
   * routes use, and since Feature 032 the employment record of the
   * authenticated account — so a client cannot sign somebody else's name to a
   * decision by putting an id in the body.
   */
  @ApiOperation({
    summary: 'Approve, refuse or cancel a request',
    description:
      '**The only write in this API that moves another module’s data**: approving deducts the days from the employee’s balances, in the same transaction. That is why it is a sub-resource rather than a field on a general `PATCH` — folding it in would have made "did this write touch the ledger" a question about which fields the body carried. Allowed only while the request is `PENDING`; anything else is a `409`. The decider is taken from the authenticated account’s employment record, never from the body, so nobody can sign somebody else’s name to a decision.',
  })
  @ApiOkEnvelope(LeaveRequestEntity)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  @Patch(':id/status')
  @RequirePermission('LEAVE_REQUESTS.APPROVE')
  updateStatus(
    @CurrentEmployeeId() processedById: string,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveRequestStatusDto,
  ): Promise<LeaveRequestEntity> {
    return this.leaveRequestsService.decide(processedById, id, dto);
  }
}
