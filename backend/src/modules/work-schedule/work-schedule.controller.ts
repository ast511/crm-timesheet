import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ApiCreatedEnvelope,
  ApiOkArrayEnvelope,
  ApiOkEnvelope,
  ApiOkNullEnvelope,
} from '../../common/swagger/api-envelope-response.decorator';
import { ApiStandardErrors } from '../../common/swagger/api-standard-errors.decorator';
import { API_TAG } from '../../config/swagger-tags';
import { BEARER_AUTH_NAME } from '../../config/swagger.setup';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
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
 * ## The schedule and the addresses take different keys
 *
 * Feature 041 gated both writes, and `WORK_SCHEDULE` is the one resource in the
 * catalog whose `EDIT` and `CONFIGURE` cells name two genuinely different jobs
 * rather than two sizes of the same one:
 *
 * | Route | Key | The catalog's own words |
 * | --- | --- | --- |
 * | `PUT /work-schedule` | `WORK_SCHEDULE.EDIT` | "Change the working days, hours and entry limits" |
 * | `POST /work-schedule/emails`, `DELETE /work-schedule/emails/:id` | `WORK_SCHEDULE.CONFIGURE` | "Maintain the addresses notified when a timesheet needs approval" |
 *
 * The split is worth having. `Admin - Standard` holds `WORK_SCHEDULE.EDIT` and
 * **not** `WORK_SCHEDULE.CONFIGURE` — one of the nine cells the seed deliberately
 * withholds from that tier — so an ordinary administrator may change the working
 * week and may not reroute the approval mail to themselves. That is an act whose
 * consequences outlive the click, and `Admin - Full Access` is how it is granted.
 *
 * The two reads stay ungated, and `GET /work-schedule` in particular must: it is
 * "the endpoint every client needs before it renders a single timestamp",
 * because the company timezone lives on it.
 */
@ApiTags(API_TAG.WorkSchedule)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors()
@Controller('work-schedule')
export class WorkScheduleController {
  constructor(private readonly workScheduleService: WorkScheduleService) {}

  /** The configuration, or a 404 while none has been stored. */
  @ApiOperation({
    summary: 'Read the working schedule',
    description:
      '**The endpoint every client needs before it renders a single timestamp.** `timezone` is the company’s IANA zone, and it is the zone every date in this API should be formatted in — not the browser’s. A `404` means no configuration has been stored yet, which is a legitimate state on a fresh deployment.',
  })
  @ApiOkEnvelope(WorkScheduleEntity)
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
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
  @ApiOperation({
    summary: 'Store the working schedule',
    description:
      '`PUT` because the address is known before the resource exists, the body is complete, and sending it twice leaves the same state. Answers `200` whether it created or replaced — a `201` would let a client tell the two apart, which is exactly what this endpoint exists to spare it. `workingDays` is sorted into week order before it is stored, so the response may not echo the order that was sent.',
  })
  @ApiOkEnvelope(WorkScheduleEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST, HttpStatus.FORBIDDEN)
  @Put()
  @RequirePermission('WORK_SCHEDULE.EDIT')
  save(@Body() dto: UpdateWorkScheduleDto): Promise<WorkScheduleEntity> {
    return this.workScheduleService.save(dto);
  }

  @ApiOperation({
    summary: 'List the timesheet-approval addresses',
    description:
      'Unpaginated: the list is bounded by a configured maximum rather than by a page size.',
  })
  @ApiOkArrayEnvelope(TimesheetApprovalEmailEntity)
  @Get('emails')
  findEmails(): Promise<TimesheetApprovalEmailEntity[]> {
    return this.workScheduleService.findEmails();
  }

  /** Answers 201; Nest applies it to `@Post` without a `@HttpCode`. */
  @ApiOperation({
    summary: 'Add a timesheet-approval address',
    description:
      'The address is trimmed and lower-cased before the duplicate check, so `HR@company.com` and `hr@company.com` are the same entry.',
  })
  @ApiCreatedEnvelope(TimesheetApprovalEmailEntity)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.CONFLICT,
  )
  @Post('emails')
  @RequirePermission('WORK_SCHEDULE.CONFIGURE')
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
  @ApiOperation({
    summary: 'Remove a timesheet-approval address',
    description: 'Answers `200` with `data: null` rather than `204`.',
  })
  @ApiOkNullEnvelope()
  @ApiStandardErrors(HttpStatus.FORBIDDEN, HttpStatus.NOT_FOUND)
  @Delete('emails/:id')
  @RequirePermission('WORK_SCHEDULE.CONFIGURE')
  removeEmail(@Param('id') id: string): Promise<void> {
    return this.workScheduleService.removeEmail(id);
  }
}
