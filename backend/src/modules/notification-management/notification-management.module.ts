import { Module } from '@nestjs/common';

import { EmployeeModule } from '../employees/employee.module';
import { NotificationCampaignController } from './notification-campaign.controller';
import { NotificationCampaignService } from './notification-campaign.service';
import { ReminderController } from './reminder.controller';
import { ReminderService } from './reminder.service';

/**
 * The notification-management feature: two resources, one module.
 *
 * They are together because they configure one thing — what this system tells
 * people, and when — and apart from each other because they answer different
 * questions: a standing rule tied to a deadline, and a single announcement about
 * a single occasion. Two services rather than one keeps each small and single
 * purpose; two modules would instead have split a feature an administrator
 * experiences as one screen with two tabs. It is the shape
 * `LeaveConfigurationModule` already uses for leave types and notification
 * addresses.
 *
 * **Nothing here sends anything, and that is the feature's central decision.**
 * No email, no socket, no cron, no queue, no `Notification` row. This module
 * records what the company *intends* to say; the Notification Delivery Engine —
 * the feature that follows — reads these three tables and produces the messages.
 * The separation is the same one the notification centre keeps, one step earlier
 * in the chain:
 *
 * ```text
 *   notification-management   what we intend to say      (this module)
 *   delivery engine           deciding it is time, and sending
 *   notifications             what people were told       (Feature 026)
 * ```
 *
 * Written as one feature instead, "remind people 7 days before the deadline"
 * could not be changed without a scheduler being involved in the write, and a
 * campaign could not be composed on Monday and reviewed on Tuesday before it
 * went out. It also keeps the dependency acyclic: the engine will import this
 * module and the notification centre, and neither of them will import the
 * engine.
 *
 * `PrismaModule` is not imported: it is `@Global`, so `PrismaService` is
 * injectable in both services without the repetition every feature module would
 * otherwise carry.
 *
 * **`EmployeeModule` is the only import.** A campaign names people — its author,
 * and the employees it is addressed to — so `employees` is the one other table
 * this module has business touching, and it touches it through `EmployeeService`
 * rather than by querying the table, which is the rule every module here
 * follows. Reminders need nothing at all.
 *
 * Note what is **not** imported. `EmailModule` is absent, because nothing here
 * sends mail — `sendEmail` is a stored preference, not an action.
 * `NotificationModule` is absent too, although `severity` is typed with the enum
 * that module stores: sharing a vocabulary is not a dependency, and this module
 * creates no notification. The engine will import both.
 *
 * Both services are exported, because the whole point of a configuration is that
 * something else reads it. `ReminderService` is how the engine will find the
 * enabled rules and `NotificationCampaignService` is how it will find the
 * campaigns that are due — each rather than querying these tables directly, so
 * the rules about what a valid campaign is stay enforced in one place however a
 * campaign comes to be read or written. No method is written for that caller in
 * advance.
 */
@Module({
  imports: [EmployeeModule],
  controllers: [ReminderController, NotificationCampaignController],
  providers: [ReminderService, NotificationCampaignService],
  exports: [ReminderService, NotificationCampaignService],
})
export class NotificationManagementModule {}
