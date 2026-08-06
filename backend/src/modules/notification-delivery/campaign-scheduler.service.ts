import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import {
  DUE_CAMPAIGN_CRON,
  SCHEDULER_ENABLED_KEY,
} from './notification-delivery.constants';
import { NotificationDeliveryRepository } from './notification-delivery.repository';
import { NotificationDispatcher } from './notification-dispatcher.service';

/**
 * Sends the campaigns whose schedule has arrived.
 *
 * The other half of the engine's clock, beside {@link ReminderSchedulerService},
 * and separate from it because the two answer different questions: that one asks
 * "which standing rules are due today", this asks "which announcements were
 * scheduled for a moment that has passed". They share a switch and a shape and
 * nothing else — different queries, different cadences, different failure modes.
 *
 * It is what makes `SCHEDULED` mean something. Feature 027 let an administrator
 * schedule a campaign and created the `(status, scheduled_at)` index for "the
 * delivery engine's tick"; this is that tick. Without it a scheduled campaign
 * would sit in the table until somebody called the manual endpoint, which is not
 * scheduling.
 *
 * Like the reminder scheduler, it **only invokes the dispatcher**: the claim, the
 * audience, the notifications, the emails and the `SENT` write all happen there,
 * so a campaign that goes out on its schedule and one somebody sends by hand are
 * the same delivery.
 */
@Injectable()
export class CampaignSchedulerService {
  private readonly logger = new Logger(CampaignSchedulerService.name);

  /** Guards against a slow batch overlapping the next minute's tick. */
  private running = false;

  constructor(
    private readonly deliveries: NotificationDeliveryRepository,
    private readonly dispatcher: NotificationDispatcher,
    private readonly config: ConfigService,
  ) {}

  /**
   * The per-minute tick.
   *
   * The re-entrancy guard matters more here than on the daily job: a backlog of
   * campaigns can take longer than a minute to send, and without it the next tick
   * would start on the same batch. That would not double-send — the claim in
   * `markSent` is what guarantees it cannot — but it would spend two runs
   * discovering the same thing.
   */
  @Cron(DUE_CAMPAIGN_CRON, { name: 'notification-delivery.campaigns' })
  async runDueCampaigns(): Promise<void> {
    if (!this.isEnabled() || this.running) {
      return;
    }

    this.running = true;

    try {
      await this.dispatchDueCampaigns(new Date());
    } finally {
      this.running = false;
    }
  }

  /**
   * Sends every campaign that is due as of `now`, one at a time.
   *
   * Sequential rather than concurrent, deliberately: a campaign can fan out to a
   * thousand notifications and a thousand emails, and running several at once
   * would multiply that load against one database and one mail server for no
   * benefit an administrator would notice.
   *
   * Each is dispatched inside its own `try`, and a `409` is an ordinary outcome
   * rather than a failure: it means the campaign was cancelled, expired or
   * claimed by another run between the scan and the send. It is logged at
   * `warn`, not `error`, because nothing is wrong.
   */
  async dispatchDueCampaigns(now: Date): Promise<void> {
    const dueIds = await this.deliveries.findDueCampaignIds(now);

    if (dueIds.length === 0) {
      return;
    }

    this.logger.log(`${dueIds.length} campaign(s) are due`);

    for (const campaignId of dueIds) {
      await this.dispatch(campaignId);
    }
  }

  private async dispatch(campaignId: string): Promise<void> {
    try {
      await this.dispatcher.executeCampaign(campaignId);
    } catch (error) {
      this.logger.warn(
        `Campaign ${campaignId} was due but was not sent: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** `NOTIFICATION_SCHEDULER_ENABLED`, defaulting to on. */
  private isEnabled(): boolean {
    return this.config.get<boolean>(SCHEDULER_ENABLED_KEY) !== false;
  }
}
