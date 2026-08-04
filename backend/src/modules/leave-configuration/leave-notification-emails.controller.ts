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
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 */
@Controller('leave-notification-emails')
export class LeaveNotificationEmailsController {
  constructor(
    private readonly leaveNotificationEmailsService: LeaveNotificationEmailsService,
  ) {}

  @Get()
  findAll(
    @Query() query: LeaveNotificationEmailQueryDto,
  ): Promise<PaginatedResult<LeaveNotificationEmailEntity>> {
    return this.leaveNotificationEmailsService.findAll(query);
  }

  /** Answers 201; Nest applies it to `@Post` without a `@HttpCode`. */
  @Post()
  create(
    @Body() dto: CreateLeaveNotificationEmailDto,
  ): Promise<LeaveNotificationEmailEntity> {
    return this.leaveNotificationEmailsService.create(dto);
  }

  @Patch(':id')
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
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.leaveNotificationEmailsService.remove(id);
  }
}
