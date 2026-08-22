import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import {
  ApiOkEnvelope,
  ApiOkPageEnvelope,
} from '../../common/swagger/api-envelope-response.decorator';
import { ApiStandardErrors } from '../../common/swagger/api-standard-errors.decorator';
import { API_TAG } from '../../config/swagger-tags';
import { BEARER_AUTH_NAME } from '../../config/swagger.setup';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationBulkResult } from './entities/notification-bulk-result.entity';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationService } from './notification.service';

/**
 * `/api/v1/administrative/notifications` — the back-office inbox, shared by the
 * three administrative roles. The prefix and the version come from
 * `configureApp`, so only the resource segments are declared here.
 *
 * A separate controller from `/notifications`, and the two are not the same
 * endpoint with a different filter. They are two *inboxes*: this one carries
 * what the people running the company need to act on — a leave request was
 * submitted, an employee was created, a synchronisation failed — and the other
 * carries what an employee is told about themselves. An administrator reads
 * both, as different people at different moments, which is exactly why one list
 * with a `?workspace=` parameter would have been wrong: it would have mixed two
 * feeds that are never read together and would have offered a second way to
 * state something the URL already says.
 *
 * **`administrative` is not a role**, and the segment does not name one. It
 * names the interface: `SUPERADMIN`, `ADMIN` and `HR` all open the same
 * workspace and all see the same `ADMINISTRATIVE_USERS` announcements. What
 * differs between them is which `ROLE` notifications reach them, and that is
 * addressing rather than permission. Which menus each role is shown is a later
 * RBAC feature and is decided nowhere in this module.
 *
 * A caller whose role is not administrative gets a `403` — not a `404`. The
 * workspace is not a secret; hiding the route would send an administrator whose
 * role header was wrong to look for a typo in the path. That check is also not
 * authorization arriving early: without it the `ADMINISTRATIVE_USERS` recipient
 * type would match anybody who asked, and every employee would receive the
 * back-office broadcasts.
 *
 * **Feature 041's sweep left both writes here ungated, deliberately.** They are
 * `PATCH /read-all` and `DELETE /` — inbox management, scoped by the service to
 * what the caller can actually see, and already behind the administrative-role
 * check above, so neither is the "the frontend hides the button but the API
 * answers anyway" hole that sweep existed to close. The catalog draws the same
 * line under `NOTIFICATION_CONFIG.VIEW`: "Reading your own inbox is not governed
 * by this and is denied to nobody." An administrator clearing their own inbox is
 * not configuring notifications, and a `NOTIFICATION_CONFIG` gate here would be a
 * checkbox that can leave somebody unable to dismiss their own messages.
 *
 * The one asymmetry worth naming is that `DELETE /` removes the shared
 * `ADMINISTRATIVE_USERS` announcements for *every* administrative user rather
 * than only for the caller — a property of there being one row per announcement,
 * recorded in Feature 026 and unchanged here. Per-recipient read and delete state
 * is the fix, and it is a schema change rather than a permission.
 *
 * **There is no `POST`, no `:id` route and no `PATCH` other than `read-all`**,
 * and their absence is deliberate rather than pending. Creation is one temporary
 * endpoint on the other controller, which takes the workspace in its body;
 * reading, marking and deleting a *single* notification live there too, because
 * an id identifies a notification rather than an inbox and a client holding one
 * should not have to know which workspace it came from to pick a URL.
 */
@ApiTags(API_TAG.Notifications)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors(HttpStatus.FORBIDDEN)
@Controller('administrative/notifications')
export class AdministrativeNotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Notifications addressed to the caller's role, plus every
   * `ADMINISTRATIVE_USERS` announcement.
   *
   * The same query parameters as the personal list, down to the DTO: the rows
   * differ, the question a client asks of them does not.
   */
  @ApiOperation({
    summary: 'List the administrative inbox',
    description:
      'Notifications addressed to the caller’s role, plus every `ADMINISTRATIVE_USERS` announcement. A separate *inbox* from `/notifications`, not a wider view of it. A caller whose role is not administrative gets a `403` rather than a `404`: the workspace is not a secret, and hiding the route would send an administrator to look for a typo in the path.',
  })
  @ApiOkPageEnvelope(NotificationEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Get()
  findAll(
    @CurrentUser() user: CurrentUser,
    @Query() query: NotificationQueryDto,
  ): Promise<PaginatedResult<NotificationEntity>> {
    return this.notificationService.findAdministrative(user, query);
  }

  /**
   * Marks every unread administrative notification the caller can see as read,
   * and reports how many rows moved.
   *
   * "Visible to the caller" is what is marked, not "in the workspace": an HR
   * user clearing their inbox does not mark the notifications addressed to
   * `ADMIN` as read, because they never saw them. The `ADMINISTRATIVE_USERS`
   * announcements they *do* see are marked for everybody, since there is one
   * flag on the row — see the service.
   */
  @ApiOperation({
    summary: 'Mark the administrative inbox read',
    description:
      '"Visible to the caller" is what is marked, not "in the workspace": an HR user clearing their inbox does not mark the notifications addressed to ADMIN as read, because they never saw them. The `ADMINISTRATIVE_USERS` announcements they *do* see are marked for everybody, since there is one flag on the row.',
  })
  @ApiOkEnvelope(NotificationBulkResult)
  @Patch('read-all')
  markAllRead(
    @CurrentUser() user: CurrentUser,
  ): Promise<NotificationBulkResult> {
    return this.notificationService.markAllAdministrativeRead(user);
  }

  /**
   * Deletes every administrative notification the caller can see, read and
   * unread alike, and reports how many rows went.
   *
   * The same scoping applies, and it matters more here: this removes the shared
   * `ADMINISTRATIVE_USERS` announcements for every administrative user, not only
   * for the caller. The count in the response is what says how much went.
   */
  @ApiOperation({
    summary: 'Empty the administrative inbox',
    description:
      'The same scoping as marking read, and it matters more here: this removes the shared `ADMINISTRATIVE_USERS` announcements for **every** administrative user, not only for the caller. The count in the response is what says how much went.',
  })
  @ApiOkEnvelope(NotificationBulkResult)
  @Delete()
  removeAll(@CurrentUser() user: CurrentUser): Promise<NotificationBulkResult> {
    return this.notificationService.removeAllAdministrative(user);
  }
}
