import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';

import { CurrentEmployeeId } from '../../common/decorators/current-employee-id.decorator';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
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
 * Note what is *not* here either: no guard, no role check, no notion of who is
 * calling beyond the header the decision is signed with. Authentication and
 * authorization are later features, and half of an access check is worse than
 * none — it reads as protection while providing none. Every route on this
 * controller is open, and the feature document says so out loud.
 *
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 */
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
  @Get()
  findAll(
    @Query() query: LeaveRequestQueryDto,
  ): Promise<PaginatedResult<LeaveRequestEntity>> {
    return this.leaveRequestsService.findAll(query);
  }

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
  @Patch(':id/status')
  updateStatus(
    @CurrentEmployeeId() processedById: string,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveRequestStatusDto,
  ): Promise<LeaveRequestEntity> {
    return this.leaveRequestsService.decide(processedById, id, dto);
  }
}
