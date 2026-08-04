import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';

import { CreateTimesheetApprovalEmailDto } from './dto/create-timesheet-approval-email.dto';
import { UpdateWorkScheduleDto } from './dto/update-work-schedule.dto';
import { TimesheetApprovalEmailEntity } from './entities/timesheet-approval-email.entity';
import { WorkScheduleEntity } from './entities/work-schedule.entity';
import { WorkScheduleService } from './work-schedule.service';

/**
 * `/api/v1/work-schedule` — the company's working schedule, and the addresses
 * notified when a timesheet needs approval.
 *
 * Singular in the path, unlike `/projects` or `/employees`, because there is
 * one of it. The URL carries no id for the same reason: a collection would
 * imply a client may choose between configurations, and there is nothing to
 * choose from.
 *
 * `PUT` rather than `POST` + `PATCH`, and that follows from the same fact. The
 * resource's address is known before it exists, the body is complete, and
 * sending it twice leaves the same state — which is what `PUT` means. It is
 * also the only write the configuration has: a client never has to ask whether
 * to create or to update.
 *
 * The addresses are a sub-resource: `/work-schedule/emails`, not
 * `/timesheet-approval-emails?workScheduleId=…`. Feature 015 made that the
 * project's rule — the scope belongs in the path, and nothing echoes it back.
 *
 * Every method is a one-line delegation on purpose. Validation is the DTOs'
 * job, the success envelope is the global interceptor's, error rendering is the
 * global filter's, and every rule — the single-row guarantee, the entry range,
 * the duplicate address — is the service's.
 *
 * Note what is *not* here: no guard, no role check, no notion of who is
 * calling, even though this is administrator-only configuration in practice.
 * Authentication and authorization are later features, and half of an access
 * check is worse than none — it reads as protection while providing none.
 */
@Controller('work-schedule')
export class WorkScheduleController {
  constructor(private readonly workScheduleService: WorkScheduleService) {}

  /** The configuration, or a 404 while none has been stored. */
  @Get()
  find(): Promise<WorkScheduleEntity> {
    return this.workScheduleService.find();
  }

  /**
   * Stores the configuration, creating it the first time.
   *
   * Answers 200 in both cases. A 201 would let a client tell the two apart,
   * which is exactly what this endpoint exists to spare it: the caller asked
   * for the schedule to *be* this, and it is.
   */
  @Put()
  save(@Body() dto: UpdateWorkScheduleDto): Promise<WorkScheduleEntity> {
    return this.workScheduleService.save(dto);
  }

  @Get('emails')
  findEmails(): Promise<TimesheetApprovalEmailEntity[]> {
    return this.workScheduleService.findEmails();
  }

  /** Answers 201; Nest applies it to `@Post` without a `@HttpCode`. */
  @Post('emails')
  addEmail(
    @Body() dto: CreateTimesheetApprovalEmailDto,
  ): Promise<TimesheetApprovalEmailEntity> {
    return this.workScheduleService.addEmail(dto);
  }

  /**
   * Answers 200 with `{ "success": true, "data": null }` rather than 204.
   *
   * A 204 would have to carry an empty body, making this the one endpoint whose
   * response is not the envelope — Feature 006 chose the explicit `data: null`
   * so a client reads the same two fields whatever it called.
   *
   * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
   * reject valid ones, and a malformed id simply matches no row and yields the
   * same 404 as an id that never existed.
   */
  @Delete('emails/:id')
  removeEmail(@Param('id') id: string): Promise<void> {
    return this.workScheduleService.removeEmail(id);
  }
}
