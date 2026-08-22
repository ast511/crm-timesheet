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
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { LeaveNotificationEmailsService } from './leave-notification-emails.service';
import { CreateLeaveNotificationEmailDto } from './leave-notification-emails/dto/create-leave-notification-email.dto';
import { LeaveNotificationEmailQueryDto } from './leave-notification-emails/dto/leave-notification-email-query.dto';
import { UpdateLeaveNotificationEmailDto } from './leave-notification-emails/dto/update-leave-notification-email.dto';
import { LeaveNotificationEmailEntity } from './leave-notification-emails/entities/leave-notification-email.entity';

/**
 * `/api/v1/leave-notification-emails` — the addresses notified about leave
 * activity.
 *
 * A top-level collection, where `/work-schedule/emails` is a sub-resource. The
 * difference is what the two lists belong to: that one hangs off the schedule by
 * a required foreign key, so it cannot exist without it, while this one stands
 * on its own — there is no leave configuration row for it to be nested under,
 * because this list *is* the configuration. Nesting it would put a scope in the
 * path that no column enforces.
 *
 * Every method is a one-line delegation on purpose. Validation is the DTOs' job,
 * the success envelope is the global interceptor's, error rendering is the
 * global filter's, and the duplicate rule is the service's.
 *
 * **The three writes require `LEAVES.CONFIGURE`, not `LEAVES.CREATE` / `.EDIT` /
 * `.DELETE`** — and the departure from the sibling controller is the seed's own
 * doing rather than a preference. `LEAVES.CONFIGURE` is described as changing
 * "the rules balances are judged by — carry-over, approval requirements,
 * **notification addresses** — and running the year-end generation", so this list
 * is named in the catalog under that key and under no other. It is a routing
 * decision about who hears from the system, which is why it sits a tier above
 * maintaining a leave type: `HR - Standard` may add a leave type and may not
 * redirect the mail about it.
 *
 * One key for all three verbs, because the resource is a list rather than a set
 * of records — adding and removing an address are the same act of configuring
 * where leave mail goes, and no tier should be able to do one and not the other.
 * `WorkScheduleController` gates its own address list the same way, on
 * `WORK_SCHEDULE.CONFIGURE`.
 *
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 */
@ApiTags(API_TAG.LeaveConfiguration)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors()
@Controller('leave-notification-emails')
export class LeaveNotificationEmailsController {
  constructor(
    private readonly leaveNotificationEmailsService: LeaveNotificationEmailsService,
  ) {}

  @ApiOperation({
    summary: 'List the leave-notification addresses',
    description:
      'Who is emailed about leave activity. A top-level collection rather than a sub-resource, because this list *is* the configuration — there is no leave-configuration row for it to hang off.',
  })
  @ApiOkPageEnvelope(LeaveNotificationEmailEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Get()
  findAll(
    @Query() query: LeaveNotificationEmailQueryDto,
  ): Promise<PaginatedResult<LeaveNotificationEmailEntity>> {
    return this.leaveNotificationEmailsService.findAll(query);
  }

  /** Answers 201; Nest applies it to `@Post` without a `@HttpCode`. */
  @ApiOperation({
    summary: 'Add a leave-notification address',
    description:
      'The address is trimmed and lower-cased before the duplicate check.',
  })
  @ApiCreatedEnvelope(LeaveNotificationEmailEntity)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.CONFLICT,
  )
  @Post()
  @RequirePermission('LEAVES.CONFIGURE')
  create(
    @Body() dto: CreateLeaveNotificationEmailDto,
  ): Promise<LeaveNotificationEmailEntity> {
    return this.leaveNotificationEmailsService.create(dto);
  }

  @ApiOperation({
    summary: 'Update a leave-notification address',
    description: 'A partial update of the address and its active flag.',
  })
  @ApiOkEnvelope(LeaveNotificationEmailEntity)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  @Patch(':id')
  @RequirePermission('LEAVES.CONFIGURE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeaveNotificationEmailDto,
  ): Promise<LeaveNotificationEmailEntity> {
    return this.leaveNotificationEmailsService.update(id, dto);
  }

  /**
   * Answers 200 with `{ "success": true, "data": null }` rather than 204, the
   * same envelope every other endpoint returns.
   */
  @ApiOperation({
    summary: 'Remove a leave-notification address',
    description: 'Answers `200` with `data: null` rather than `204`.',
  })
  @ApiOkNullEnvelope()
  @ApiStandardErrors(HttpStatus.FORBIDDEN, HttpStatus.NOT_FOUND)
  @Delete(':id')
  @RequirePermission('LEAVES.CONFIGURE')
  remove(@Param('id') id: string): Promise<void> {
    return this.leaveNotificationEmailsService.remove(id);
  }
}
