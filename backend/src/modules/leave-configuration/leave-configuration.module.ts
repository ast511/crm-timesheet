import { Module } from '@nestjs/common';

import { LeaveNotificationEmailsController } from './leave-notification-emails.controller';
import { LeaveNotificationEmailsService } from './leave-notification-emails.service';
import { LeaveTypesController } from './leave-types.controller';
import { LeaveTypesService } from './leave-types.service';

/**
 * The leave-configuration feature: two resources, one module.
 *
 * They are together because they configure one thing — how leave works here —
 * and apart from each other because they answer different questions: what kinds
 * of leave exist, and who hears about leave activity. Two services rather than
 * one keeps each of them small and single purpose, which is what
 * `WorkScheduleService` gave up when it took both the schedule and its
 * addresses; two modules would instead have split a feature that an
 * administrator experiences as one screen.
 *
 * **There is no leave policy here, and that is a decision rather than an
 * omission.** A draft of this feature had one: a singleton row with a
 * `carryOverEnabled` flag for the whole company. It was dropped because leave is
 * granted per employee and per year — HR sets each person's days at the start of
 * the year, against their contract and their seniority — so a company-wide
 * switch could not decide anything the per-employee grant does not already
 * decide, and a flag nobody reads is a flag that eventually contradicts the
 * data. Carry-over rules, if they turn out to be needed, belong to the Leave
 * Balances feature, beside the balances they would apply to.
 *
 * `PrismaModule` is not imported: it is `@Global`, so `PrismaService` is
 * injectable here without the repetition every feature module would otherwise
 * carry. Nothing else is imported either — neither table references an employee,
 * a project or the work schedule, which is what makes this module a leaf of the
 * graph rather than a node in it.
 *
 * Both services are exported, because the whole point of a configuration is that
 * something else reads it. Leave Requests will ask `LeaveTypesService` whether a
 * type requires approval, and the feature that eventually sends mail will ask
 * `LeaveNotificationEmailsService` where to send it — each rather than querying
 * these tables itself, the same hand-off every module before this one makes.
 *
 * **What this module does not do**, and will not: it grants no leave, records no
 * request, approves nothing, computes no balance and sends no mail. Those are
 * later features with tables of their own. Keeping them out is what lets the
 * configuration change without a migration of anything already recorded.
 */
@Module({
  controllers: [LeaveTypesController, LeaveNotificationEmailsController],
  providers: [LeaveTypesService, LeaveNotificationEmailsService],
  exports: [LeaveTypesService, LeaveNotificationEmailsService],
})
export class LeaveConfigurationModule {}
