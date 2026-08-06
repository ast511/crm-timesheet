import { Module } from '@nestjs/common';

import { EmailModule } from '../email/email.module';
import { EmployeeModule } from '../employees/employee.module';
import { NotificationManagementModule } from '../notification-management/notification-management.module';
import { NotificationModule } from '../notifications/notification.module';
import { CampaignSchedulerService } from './campaign-scheduler.service';
import { NotificationBroadcaster } from './notification-broadcaster.service';
import { NotificationDeliveryController } from './notification-delivery.controller';
import { NotificationDeliveryRepository } from './notification-delivery.repository';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { NotificationGateway } from './websocket/notification.gateway';
import { WebsocketUserRegistryService } from './websocket/websocket-user-registry.service';

/**
 * The Notification Delivery Engine — the feature that turns a stored intention
 * into a message somebody actually receives.
 *
 * It is the last link in a chain three features long, and the only one that does
 * anything to the outside world:
 *
 * ```text
 *   notification-management   what we intend to say         (Feature 027)
 *   notification-delivery     deciding it is time, and sending   ← this module
 *   notifications             what people were told          (Feature 026)
 * ```
 *
 * **This module imports all four of its dependencies and none of them imports
 * it**, which is the direction Features 025, 026 and 027 each committed to in
 * advance and the reason the graph is acyclic. The notification centre stores
 * messages, the management module stores intentions, the email module delivers
 * mail, the employees module knows who works here — and not one of them has
 * heard of a scheduler, a socket or a campaign being sent.
 *
 * | Import | What is taken from it |
 * | --- | --- |
 * | `NotificationModule` | `NotificationService.createMany` and `countUnread`; the addressing rules stay enforced there |
 * | `NotificationManagementModule` | the campaigns and reminder rules to execute, and the `SENT` transition |
 * | `EmailModule` | `EmailService.sendMany` — no `SMTP_*` variable is read here and Nodemailer is not imported |
 * | `EmployeeModule` | who a campaign's audience resolves to, and how to reach them |
 *
 * `PrismaModule` is deliberately **absent**, and its absence is the module's
 * central structural claim: this feature owns no table, so nothing here holds a
 * `PrismaService`. Every read and write goes through the module that owns the
 * data — see `NotificationDeliveryRepository` for the whole argument.
 *
 * **Nothing is exported.** That is not an oversight either: the dispatcher is the
 * only entry point for delivery, and it is reached through the manual endpoint,
 * the two schedulers and — when the timesheet and leave features want to announce
 * something — by importing this module then. Exporting it before there is a
 * caller would be designing the seam around a guess.
 *
 * `ScheduleModule.forRoot()` is registered in `app.module.ts` rather than here,
 * beside the other application-wide concerns, because it installs a global
 * scheduler registry rather than a dependency of this feature — the same call
 * `ConfigModule` and `PrismaModule` get.
 */
@Module({
  imports: [
    NotificationModule,
    NotificationManagementModule,
    EmailModule,
    EmployeeModule,
  ],
  controllers: [NotificationDeliveryController],
  providers: [
    // The engine.
    NotificationDispatcher,
    NotificationDeliveryRepository,
    // The clock: two ticks, one switch, and neither of them does anything but
    // call the dispatcher.
    CampaignSchedulerService,
    ReminderSchedulerService,
    // The real-time layer. The broadcaster registers itself with
    // `NotificationService` on startup, which is how the notification centre
    // announces its changes without knowing what a socket is.
    NotificationGateway,
    NotificationBroadcaster,
    WebsocketUserRegistryService,
  ],
})
export class NotificationDeliveryModule {}
