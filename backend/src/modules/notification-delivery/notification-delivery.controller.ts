import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiOkEnvelope } from '../../common/swagger/api-envelope-response.decorator';
import { ApiStandardErrors } from '../../common/swagger/api-standard-errors.decorator';
import { API_TAG } from '../../config/swagger-tags';
import { BEARER_AUTH_NAME } from '../../config/swagger.setup';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { DeliveryResultEntity } from './entities/delivery-result.entity';
import { NotificationDispatcher } from './notification-dispatcher.service';

/**
 * `/api/v1/notification-delivery` — one route, and it exists so the engine can
 * be exercised without a frontend and without waiting for a schedule.
 *
 * **This endpoint is for development and Postman testing**, exactly as the
 * feature specifies, and it is documented as such in three places — here, on the
 * method, and in the feature document — so it cannot quietly become permanent.
 * It is the same seam the notification centre's temporary `POST /notifications`
 * is: a way to trigger, by hand, something that will otherwise only ever happen
 * on a schedule.
 *
 * It is deliberately **not** `POST /notification-campaigns/:id/send`. Feature 027
 * asserts in its routing spec that no such route exists, because nothing in that
 * module sends anything; putting the trigger under this feature's own prefix
 * keeps that true and puts the URL where the behaviour lives.
 *
 * There is no `POST .../execute` for reminders. A reminder has no id a person
 * would want to fire by hand in isolation — it is a standing rule whose whole
 * point is the schedule — and a route that fired one would be a way to send the
 * entire company a timesheet warning on a Tuesday afternoon by mistake. The
 * reminder path is exercised by the scheduler's own unit tests, which call the
 * same dispatcher.
 *
 * The controller is thin to the point of being one delegation, like every other
 * in this project: every rule, every refusal and every side effect is the
 * dispatcher's.
 *
 * ## `NOTIFICATION_CONFIG.EDIT`, and why a "dev endpoint" gets a real gate
 *
 * Feature 041 gated this route, and it is the clearest case in the whole sweep.
 * "For development and Postman testing" describes the *intent*; what the route
 * actually does is write a notification for every recipient of a campaign and
 * put email on the wire under the company's `From` header, immediately, for
 * anybody who can name a campaign id. Ungated, an ordinary employee could send
 * an announcement to everybody by guessing nothing harder than a cuid they can
 * read off `GET /notification-campaigns`.
 *
 * `NOTIFICATION_CONFIG.EDIT` rather than `.CREATE`: nothing is composed here, and
 * what the call does to the campaign is move it to `SENT` — the seed describes
 * `EDIT` as changing "a reminder rule or an announcement that has not been sent",
 * which is exactly the resource and exactly the moment. It also puts sending at
 * the same authority as cancelling, which is the pair of decisions somebody makes
 * about a scheduled announcement, and it keeps the whole flow inside one
 * `Admin - Standard` tier: compose, edit, send.
 */
@ApiTags(API_TAG.NotificationDelivery)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors()
@Controller('notification-delivery')
export class NotificationDeliveryController {
  constructor(private readonly dispatcher: NotificationDispatcher) {}

  /**
   * Sends a stored campaign immediately, whatever its schedule says.
   *
   * A `DRAFT` campaign is sent as readily as a `SCHEDULED` one: this is somebody
   * deliberately saying "send it now", and refusing a draft would mean an
   * administrator had to schedule an announcement for two minutes' time in order
   * to test it.
   *
   * | Situation | Answer |
   * | --- | --- |
   * | sent | `200` with the delivery report |
   * | no such campaign | `404` |
   * | already `SENT`, `CANCELLED`, or expired | `409` naming the reason |
   *
   * `200` rather than the `201` Nest gives a `@Post`, because nothing was
   * created: there is no resource to point at and no `Location` to return. What
   * the caller gets back is a report of what happened — how many notifications
   * were written, how many emails went out, and whether the mail server accepted
   * them.
   *
   * `campaignId` is taken as a plain string: ids are cuids, so `ParseUUIDPipe`
   * would reject valid ones, and an id that matches nothing produces the same
   * `404` as one that never existed.
   */
  @ApiOperation({
    summary: 'Send a stored campaign now',
    description:
      '**For development and manual testing**, so the engine can be exercised without waiting for a schedule. A `DRAFT` campaign is sent as readily as a `SCHEDULED` one: this is somebody deliberately saying "send it now", and refusing a draft would mean scheduling an announcement for two minutes’ time in order to test it. Already `SENT`, `CANCELLED` or expired is a `409` naming the reason. Answers `200` rather than `201` because nothing was created — what comes back is a report of what happened: how many notifications were written, how many emails went out, and whether the mail server accepted them.',
  })
  @ApiOkEnvelope(DeliveryResultEntity)
  @ApiStandardErrors(
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  @Post('execute/:campaignId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('NOTIFICATION_CONFIG.EDIT')
  execute(
    @Param('campaignId') campaignId: string,
  ): Promise<DeliveryResultEntity> {
    return this.dispatcher.executeCampaign(campaignId);
  }
}
