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

import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
import { CreateNotificationCampaignDto } from './dto/create-notification-campaign.dto';
import { NotificationCampaignQueryDto } from './dto/notification-campaign-query.dto';
import { UpdateNotificationCampaignDto } from './dto/update-notification-campaign.dto';
import {
  NotificationCampaignEntity,
  NotificationCampaignSummaryEntity,
} from './entities/notification-campaign.entity';
import { NotificationCampaignService } from './notification-campaign.service';

/**
 * `/api/v1/notification-campaigns` — announcements somebody composed by hand,
 * stored until the Notification Delivery Engine sends them. The prefix and the
 * version come from `configureApp`, so only the resource segment is declared
 * here.
 *
 * **Nothing on this controller sends anything.** `POST` composes a campaign;
 * `PATCH` edits one that has not gone out. No email leaves the system, no
 * notification is written and no job is scheduled — `status` and `sentAt` say
 * what has and has not happened, and only the engine moves them to `SENT`.
 *
 * The spelling is `notification-campaigns` rather than `campaigns`, because a
 * bare "campaign" in a business application is as likely to mean a marketing one
 * as a notification, and the URL is the one place the ambiguity cannot be
 * resolved by context.
 *
 * There is no `/me` variant and no `?createdByEmployeeId=`: every administrator
 * maintains the same list, and scoping announcements to whoever typed them would
 * make a colleague's scheduled campaign invisible to the person covering for
 * them.
 *
 * Who is calling comes from `@CurrentUser()` — three headers when this was
 * written, the account behind a validated access token since Feature 032, and
 * not a line of this file changed for that, which is what the seam was for. It
 * is read on `POST` alone, and only because a campaign records its author.
 *
 * **The three writes require `NOTIFICATION_CONFIG.CREATE`, `.EDIT` and
 * `.DELETE`** as of Feature 041, the same three keys the reminders take — the
 * catalog names both resources in one cell ("Add a reminder rule, **or compose an
 * announcement**"), which is the seed's own statement that maintaining what this
 * company sends is one job. An `Admin - Standard` account composes and cancels;
 * deleting a campaign is `Admin - Full Access`, and the service refuses it with a
 * `409` on one that was actually sent, because that is a record of something that
 * happened.
 *
 * Composing is gated and **sending is gated separately**, on
 * `POST /notification-delivery/execute/:campaignId` — see
 * `NotificationDeliveryController`. Nothing on this controller sends anything, so
 * clearing this gate puts no mail on the wire.
 *
 * Every method is a one-line delegation on purpose, and `id` is taken as a plain
 * string: ids are cuids, so `ParseUUIDPipe` would reject valid ones.
 */
@ApiTags(API_TAG.NotificationManagement)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors()
@Controller('notification-campaigns')
export class NotificationCampaignController {
  constructor(private readonly campaignService: NotificationCampaignService) {}

  /**
   * One page of campaigns.
   *
   * Each row carries `recipientType` and `recipientCount` rather than the
   * recipients themselves: resolving up to two hundred names per row would put
   * twenty thousand nested objects on a full page to render a column that says
   * "3 recipients". `GET /:id` is where the audience belongs.
   */
  @ApiOperation({
    summary: 'List announcement campaigns',
    description:
      'Each row carries `recipientType` and `recipientCount` rather than the recipients themselves: resolving up to two hundred names per row would put twenty thousand nested objects on a full page to render a column that says "3 recipients". `recipientCount` is `1` for an `ALL_EMPLOYEES` campaign — that is the stored row count, not the size of the audience, which is resolved when the campaign is sent.',
  })
  @ApiOkPageEnvelope(NotificationCampaignSummaryEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Get()
  findAll(
    @Query() query: NotificationCampaignQueryDto,
  ): Promise<PaginatedResult<NotificationCampaignSummaryEntity>> {
    return this.campaignService.findAll(query);
  }

  /** One campaign, with every recipient resolved to a person. */
  @ApiOperation({
    summary: 'Read one campaign, with its audience',
    description:
      'Everything the list carries, plus every recipient resolved to a person. `employee` is null on the `ALL_EMPLOYEES` entry, and that null is the point: the campaign is addressed to everybody *at the moment it is sent*, so there is no list of people to publish.',
  })
  @ApiOkEnvelope(NotificationCampaignEntity)
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
  @Get(':id')
  findOne(@Param('id') id: string): Promise<NotificationCampaignEntity> {
    return this.campaignService.findOne(id);
  }

  /**
   * Composes a campaign and stores its audience. **It is not sent.**
   *
   * The status is derived rather than accepted: a body carrying `scheduledAt`
   * produces a `SCHEDULED` campaign, one without produces a `DRAFT`.
   *
   * Answers 201; Nest applies it to `@Post` without a `@HttpCode`.
   */
  @ApiOperation({
    summary: 'Compose a campaign',
    description:
      '**It is not sent.** No email leaves the system, no notification is written and no job is scheduled — the Notification Delivery Engine is the only thing that turns this into anything. The status is *derived* rather than accepted: a body carrying `scheduledAt` produces a `SCHEDULED` campaign, one without produces a `DRAFT`.',
  })
  @ApiCreatedEnvelope(NotificationCampaignEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST, HttpStatus.FORBIDDEN)
  @Post()
  @RequirePermission('NOTIFICATION_CONFIG.CREATE')
  create(
    @CurrentUser() user: CurrentUser,
    @Body() dto: CreateNotificationCampaignDto,
  ): Promise<NotificationCampaignEntity> {
    return this.campaignService.create(user, dto);
  }

  /**
   * Edits a campaign that has not gone out yet, cancelling included:
   * `{ "status": "CANCELLED" }`.
   *
   * A `409` on a `SENT` or `CANCELLED` campaign, naming the status. That is a
   * statement about the state of the resource rather than about who is asking,
   * which is why it is not a `403`.
   */
  @ApiOperation({
    summary: 'Edit or cancel a campaign',
    description:
      'Cancelling is `{ "status": "CANCELLED" }` — the one status value a client may state, because everything else about a campaign’s status is derived. A `409` on a `SENT` or `CANCELLED` campaign, naming the status: that is a statement about the state of the resource rather than about who is asking, which is why it is not a `403`.',
  })
  @ApiOkEnvelope(NotificationCampaignEntity)
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
    @Body() dto: UpdateNotificationCampaignDto,
  ): Promise<NotificationCampaignEntity> {
    return this.campaignService.update(id, dto);
  }

  /**
   * Deletes a campaign that was never sent; a `409` on one that was.
   *
   * Answers 200 with `{ "success": true, "data": null }` rather than 204, the
   * call Feature 006 made so a client reads the same two fields whatever it
   * called.
   */
  @ApiOperation({
    summary: 'Delete a campaign',
    description:
      'Only one that was never sent; a `409` on one that was, because that is a record of something that happened. Answers `200` with `data: null` rather than `204`.',
  })
  @ApiOkNullEnvelope()
  @ApiStandardErrors(
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  @Delete(':id')
  @RequirePermission('NOTIFICATION_CONFIG.DELETE')
  remove(@Param('id') id: string): Promise<void> {
    return this.campaignService.remove(id);
  }
}
