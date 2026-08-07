import { Module } from '@nestjs/common';

import { EmailModule } from '../email/email.module';
import { EmployeeModule } from '../employees/employee.module';
import { NotificationManagementModule } from '../notification-management/notification-management.module';
import { NotificationModule } from '../notifications/notification.module';
import { WorkScheduleModule } from '../work-schedule/work-schedule.module';
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
 * **This module imports all five of its dependencies and none of them imports
 * it**, which is the direction Features 025, 026 and 027 each committed to in
 * advance and the reason the graph is acyclic. The notification centre stores
 * messages, the management module stores intentions, the email module delivers
 * mail, the employees module knows who works here, the work schedule knows who
 * to tell about a timesheet — and not one of them has heard of a scheduler, a
 * socket or a campaign being sent.
 *
 * | Import | What is taken from it |
 * | --- | --- |
 * | `NotificationModule` | `NotificationService.createMany` and `countUnread`; the addressing rules stay enforced there |
 * | `NotificationManagementModule` | the campaigns and reminder rules to execute, and the `SENT` transition |
 * | `EmailModule` | `EmailService.sendMany` — no `SMTP_*` variable is read here and Nodemailer is not imported |
 * | `EmployeeModule` | who a campaign's audience resolves to, and how to reach them |
 * | `WorkScheduleModule` | the timesheet approval addresses an administrative event is emailed to |
 *
 * `WorkScheduleModule` arrived with Feature 030 and is the narrowest of the five:
 * one method, `findEmails`, for the one audience that is not a list of employees.
 * Feature 016 created `timesheet_approval_emails` as "an address notified when a
 * timesheet needs approval" and nothing had read it until an event had to reach
 * the people who review one.
 *
 * `PrismaModule` is deliberately **absent**, and its absence is the module's
 * central structural claim: this feature owns no table, so nothing here holds a
 * `PrismaService`. Every read and write goes through the module that owns the
 * data — see `NotificationDeliveryRepository` for the whole argument.
 *
 * **`NotificationDispatcher` is the one export**, added by Feature 030 rather
 * than in advance. Feature 028 said the dispatcher would be reached "when the
 * timesheet and leave features want to announce something — by importing this
 * module then", and declined to export it earlier on the grounds that designing
 * the seam around a guess is worse than adding it when a caller exists. The
 * timesheet module is that caller, and what it needs turned out to be
 * {@link NotificationDispatcher.executeEvent} — a third delivery source beside
 * the campaign and the reminder. The repository and the two schedulers stay
 * private: nothing outside this module has business building a delivery plan or
 * deciding that a schedule has arrived.
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
    WorkScheduleModule,
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
  exports: [NotificationDispatcher],
})
export class NotificationDeliveryModule {}
