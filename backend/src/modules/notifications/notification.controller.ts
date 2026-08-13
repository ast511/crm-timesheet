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
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationBulkResult } from './entities/notification-bulk-result.entity';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationService } from './notification.service';

/**
 * `/api/v1/notifications` — the personal workspace, plus the routes that address
 * a single notification in either workspace. The prefix and the version come
 * from `configureApp`, so only the resource segments are declared here.
 *
 * A `/notifications` collection that means "mine" rather than a `/me/...` scope
 * like Feature 023's leave requests. The two are the same idea and the shorter
 * spelling is right here because there is no second, cross-cutting personal
 * list to distinguish it from: nothing in this API lists *everybody's* personal
 * notifications, so `/notifications` is unambiguous where `/leave-requests`
 * genuinely was not. The administrative workspace is a different inbox, not a
 * wider view of this one, and it has its own controller.
 *
 * Who "me" is comes from `@CurrentUser()`. That read two headers any caller
 * could set, kept to a single decorator so that the day authentication landed,
 * nothing in this file would change. Feature 032 landed it, and nothing in this
 * file changed — see the decorator, which quotes the promise back. The account
 * and the role now come from `users`, behind a validated access token.
 *
 * **The by-id routes are here rather than duplicated per workspace.** An id
 * identifies a notification, not an inbox, so `GET /notifications/:id`,
 * `PATCH /notifications/:id/read` and `DELETE /notifications/:id` serve both
 * workspaces: the service offers the caller every audience they hold and answers
 * `404` if none of them contains the row. A parallel set under
 * `/administrative/notifications/:id` would force a client holding an id to know
 * which workspace it came from before it could choose a URL.
 *
 * Every method is a one-line delegation on purpose. Validation is the DTOs' job,
 * the success envelope is the global interceptor's, error rendering is the
 * global filter's, and every rule is the service's.
 *
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 */
@ApiTags(API_TAG.Notifications)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Notifications addressed to the caller, plus every `ALL_USERS` announcement.
   *
   * Newest first unless `?sortOrder=asc` says otherwise — the one list in this
   * API that defaults to descending, because an inbox is a feed rather than a
   * register. The default lives in `NotificationQueryDto` as a property
   * initialiser, so the service always receives a concrete ordering.
   */
  @ApiOperation({
    summary: 'List my notifications',
    description:
      'Notifications addressed to the caller, plus every `ALL_USERS` announcement. **Newest first** unless `?sortOrder=asc` says otherwise — the one list in this API that defaults to descending, because an inbox is a feed rather than a register.',
  })
  @ApiOkPageEnvelope(NotificationEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Get()
  findAll(
    @CurrentUser() user: CurrentUser,
    @Query() query: NotificationQueryDto,
  ): Promise<PaginatedResult<NotificationEntity>> {
    return this.notificationService.findPersonal(user, query);
  }

  /**
   * Marks every unread personal notification of the caller as read, `ALL_USERS`
   * announcements included, and reports how many rows moved.
   *
   * Declared **before** the `:id` routes. Nest matches in declaration order, and
   * although `read-all` is one segment where `:id/read` is two — so they cannot
   * actually collide today — the ordering is what keeps that true the day a
   * plain `PATCH /notifications/:id` is added. The routing spec pins it.
   *
   * Marking an `ALL_USERS` announcement read marks it read for everybody who can
   * see it: there is one flag on the row. See the service for why, and the
   * feature document for what it would take to change.
   */
  @ApiOperation({
    summary: 'Mark all my notifications read',
    description:
      'Reports how many rows moved; `0` is a legitimate answer and means nothing was unread. **Marking an `ALL_USERS` announcement read marks it read for everybody who can see it** — there is one flag on the row, which is a property of the storage rather than of this endpoint.',
  })
  @ApiOkEnvelope(NotificationBulkResult)
  @Patch('read-all')
  markAllRead(
    @CurrentUser() user: CurrentUser,
  ): Promise<NotificationBulkResult> {
    return this.notificationService.markAllPersonalRead(user);
  }

  /**
   * Deletes every personal notification of the caller, read and unread alike,
   * and reports how many rows went.
   *
   * A `DELETE` on the collection rather than on a `.../all` sub-path: the
   * collection is what is being emptied, and the URL says so. It answers 200
   * with the count rather than 204, for the reason Feature 006 gave — a client
   * reads the same envelope whatever it called — and because "nothing was
   * deleted" and "everything was deleted" are worth telling apart.
   */
  @ApiOperation({
    summary: 'Empty my inbox',
    description:
      'Deletes every personal notification of the caller, read and unread alike. A `DELETE` on the collection rather than on a `.../all` sub-path: the collection is what is being emptied, and the URL says so. It answers `200` with the count rather than `204`, because "nothing was deleted" and "everything was deleted" are worth telling apart.',
  })
  @ApiOkEnvelope(NotificationBulkResult)
  @Delete()
  removeAll(@CurrentUser() user: CurrentUser): Promise<NotificationBulkResult> {
    return this.notificationService.removeAllPersonal(user);
  }

  /**
   * Creates a notification, in either workspace.
   *
   * **Temporary, and for testing only.** Notifications will be produced by the
   * Notification Delivery Engine from events the application already records;
   * this route exists so the centre can be exercised before that engine is
   * written, and it goes away when the engine arrives.
   *
   * Answers 201; Nest applies it to `@Post` without a `@HttpCode`.
   */
  @ApiOperation({
    summary: 'Create a notification (temporary, for testing)',
    description:
      '**Temporary, and for testing only.** Notifications are produced by the Notification Delivery Engine from events the application already records; this route exists so the centre can be exercised directly and it goes away when nothing needs it.',
    deprecated: true,
  })
  @ApiCreatedEnvelope(NotificationEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Post()
  create(@Body() dto: CreateNotificationDto): Promise<NotificationEntity> {
    return this.notificationService.create(dto);
  }

  /**
   * One notification, from whichever workspace the caller can see it in.
   *
   * A notification the caller may not see answers the same 404 as one that does
   * not exist — distinguishing them would make this endpoint a way to confirm
   * that a message was sent.
   */
  @ApiOperation({
    summary: 'Read one notification',
    description:
      'Serves **both** workspaces: an id identifies a notification, not an inbox, so a client holding one does not have to know which inbox it came from to pick a URL. A notification the caller may not see answers the same `404` as one that does not exist — distinguishing them would make this endpoint a way to confirm that a message was sent.',
  })
  @ApiOkEnvelope(NotificationEntity)
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
  @Get(':id')
  findOne(
    @CurrentUser() user: CurrentUser,
    @Param('id') id: string,
  ): Promise<NotificationEntity> {
    return this.notificationService.findOne(user, id);
  }

  /**
   * Marks one notification as read, setting `readAt` to the server's clock.
   *
   * Idempotent: reading an already-read notification succeeds and moves nothing,
   * `readAt` included, so two tabs opening one message is not an error and the
   * timestamp keeps saying when it was *first* read.
   */
  @ApiOperation({
    summary: 'Mark one notification read',
    description:
      'Sets `readAt` to the server’s clock. **Idempotent**: reading an already-read notification succeeds and moves nothing, `readAt` included, so two tabs opening one message is not an error and the timestamp keeps saying when it was *first* read.',
  })
  @ApiOkEnvelope(NotificationEntity)
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
  @Patch(':id/read')
  markRead(
    @CurrentUser() user: CurrentUser,
    @Param('id') id: string,
  ): Promise<NotificationEntity> {
    return this.notificationService.markRead(user, id);
  }

  /**
   * Deletes one notification the caller can see.
   *
   * Answers 200 with `{ "success": true, "data": null }` rather than 204. A 204
   * would have to carry an empty body, making this the one endpoint whose
   * response is not the envelope — Feature 006 chose the explicit `data: null`
   * so a client reads the same two fields whatever it called.
   */
  @ApiOperation({
    summary: 'Delete one notification',
    description: 'Answers `200` with `data: null` rather than `204`.',
  })
  @ApiOkNullEnvelope()
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
  @Delete(':id')
  remove(
    @CurrentUser() user: CurrentUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.notificationService.remove(user, id);
  }
}
