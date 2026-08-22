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
import { CreateReminderDto } from './dto/create-reminder.dto';
import { ReminderQueryDto } from './dto/reminder-query.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { ReminderEntity } from './entities/reminder.entity';
import { ReminderService } from './reminder.service';

/**
 * `/api/v1/reminders` — the rules saying how long before a deadline people
 * should be reminded. The prefix and the version come from `configureApp`, so
 * only the resource segment is declared here.
 *
 * Plural and top-level: there are many reminder rules and each is addressable,
 * so this is an ordinary collection rather than a singleton like
 * `/work-schedule`. It is not nested under anything either, because a reminder
 * is not a property of some larger configuration object.
 *
 * **Nothing here fires a reminder.** These endpoints maintain configuration; the
 * Notification Delivery Engine reads it and decides when a deadline is near.
 *
 * Every method is a one-line delegation on purpose. Validation is the DTOs' job,
 * the success envelope is the global interceptor's, error rendering is the
 * global filter's, and every rule — the unique name, the delivery methods, the
 * ordering — is the service's.
 *
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 *
 * The campaigns controller *does* read the caller, and only because a campaign
 * records its author; a reminder records nobody.
 *
 * ## The writes require `NOTIFICATION_CONFIG.CREATE`, `.EDIT` and `.DELETE`
 *
 * Feature 041 enforced what Feature 027 could only write down. The three keys are
 * the catalog's own for this resource — "Add a reminder rule", "Change or cancel
 * a reminder rule", "Remove a reminder rule" — and the first two are in the
 * `Admin - Standard` baseline while `HR - Full Access` holds none of the three.
 * **That delivers the narrowing this file has always asked for**: reminders are
 * administrators' and not HR's, because a reminder is a standing rule that fires
 * against every employee on a schedule nobody re-approves, so a bad one goes out
 * repeatedly and silently.
 *
 * It arrives as a permission rather than the role check the original note
 * imagined, which is strictly better: the same restriction, plus the ability to
 * grant one HR lead the reminders without granting them the rest of the admin
 * tier. `NOTIFICATION_CONFIG.DELETE` is in no baseline at all — `Admin - Full
 * Access` and a super-admin only — which is the seed's usual line on deletes.
 *
 * The reads stay ungated. Reading which reminders exist is what the notification
 * configuration screen does before it decides whether to show an edit button.
 */
@ApiTags(API_TAG.NotificationManagement)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors()
@Controller('reminders')
export class ReminderController {
  constructor(private readonly reminderService: ReminderService) {}

  @ApiOperation({
    summary: 'List reminder rules',
    description:
      'How long before a deadline people should be reminded, and by which channels. **Nothing here fires a reminder** — the Notification Delivery Engine reads this configuration and decides when a deadline is near.',
  })
  @ApiOkPageEnvelope(ReminderEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Get()
  findAll(
    @Query() query: ReminderQueryDto,
  ): Promise<PaginatedResult<ReminderEntity>> {
    return this.reminderService.findAll(query);
  }

  @ApiOperation({ summary: 'Read one reminder rule' })
  @ApiOkEnvelope(ReminderEntity)
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
  @Get(':id')
  findOne(@Param('id') id: string): Promise<ReminderEntity> {
    return this.reminderService.findOne(id);
  }

  /** Answers 201; Nest applies it to `@Post` without a `@HttpCode`. */
  @ApiOperation({
    summary: 'Create a reminder rule',
    description:
      'The name is unique. A rule fires against every employee on a schedule nobody re-approves, which is why this resource is administrators’ rather than HR’s: `NOTIFICATION_CONFIG.CREATE` is in the `Admin - Standard` baseline and in none of the HR tiers.',
  })
  @ApiCreatedEnvelope(ReminderEntity)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.CONFLICT,
  )
  @Post()
  @RequirePermission('NOTIFICATION_CONFIG.CREATE')
  create(@Body() dto: CreateReminderDto): Promise<ReminderEntity> {
    return this.reminderService.create(dto);
  }

  /**
   * Edits a reminder — **including switching it on and off**, with
   * `{ "enabled": false }`.
   *
   * There is deliberately no `POST /reminders/:id/disable`: `enabled` is a
   * property of the rule rather than an event in its life, so a sub-resource
   * would be a second way to write one column. The notification centre's
   * `PATCH /:id/read` is the contrasting case — marking read also writes a
   * timestamp from the server's clock, which the caller cannot state.
   */
  @ApiOperation({
    summary: 'Edit a reminder rule, or switch it off',
    description:
      'Switching it off is `{ "enabled": false }`. There is deliberately no `POST /reminders/:id/disable`: `enabled` is a *property* of the rule rather than an event in its life, so a sub-resource would be a second way to write one column.',
  })
  @ApiOkEnvelope(ReminderEntity)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  @Patch(':id')
  @RequirePermission('NOTIFICATION_CONFIG.EDIT')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ): Promise<ReminderEntity> {
    return this.reminderService.update(id, dto);
  }

  /**
   * Answers 200 with `{ "success": true, "data": null }` rather than 204.
   *
   * A 204 would have to carry an empty body, making this the one endpoint whose
   * response is not the envelope — Feature 006 chose the explicit `data: null`
   * so a client reads the same two fields whatever it called.
   */
  @ApiOperation({
    summary: 'Delete a reminder rule',
    description: 'Answers `200` with `data: null` rather than `204`.',
  })
  @ApiOkNullEnvelope()
  @ApiStandardErrors(HttpStatus.FORBIDDEN, HttpStatus.NOT_FOUND)
  @Delete(':id')
  @RequirePermission('NOTIFICATION_CONFIG.DELETE')
  remove(@Param('id') id: string): Promise<void> {
    return this.reminderService.remove(id);
  }
}
