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

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
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
 * Who is calling comes from the `x-user-id`, `x-user-role` and `x-employee-id`
 * headers, through `@CurrentUser()`. **That is a placeholder for
 * authentication**, kept to a single decorator so the day auth lands, nothing in
 * this file changes. It is read on `POST` alone, and only because a campaign
 * records its author; the reads and the edits do not care who is asking, and
 * pretending otherwise would be half an access check — which reads as protection
 * while providing none.
 *
 * Every method is a one-line delegation on purpose, and `id` is taken as a plain
 * string: ids are cuids, so `ParseUUIDPipe` would reject valid ones.
 */
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
  @Get()
  findAll(
    @Query() query: NotificationCampaignQueryDto,
  ): Promise<PaginatedResult<NotificationCampaignSummaryEntity>> {
    return this.campaignService.findAll(query);
  }

  /** One campaign, with every recipient resolved to a person. */
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
  @Post()
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
  @Patch(':id')
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
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.campaignService.remove(id);
  }
}
