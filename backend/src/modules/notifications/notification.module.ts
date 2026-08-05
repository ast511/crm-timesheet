import { Module } from '@nestjs/common';

import { UserModule } from '../users/user.module';
import { AdministrativeNotificationController } from './administrative-notification.controller';
import { NotificationController } from './notification.controller';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';

/**
 * The notification centre — where notifications are stored, read, filtered,
 * marked and deleted.
 *
 * `PrismaModule` is not imported: it is `@Global`, so `PrismaService` is
 * injectable in the repository without the repetition every feature module would
 * otherwise carry.
 *
 * **`UserModule` is the only import**, and it is the narrowest dependency list
 * of any module in the leave-and-beyond half of this project. That is the point
 * rather than an accident: a notification is a message with an address on it, so
 * the only other table this module has any business touching is `users`, and it
 * touches that through `UserService` to confirm a recipient exists rather than
 * by querying the table — the rule every module here follows, and the one that
 * keeps "never return the password hash" enforceable in one place.
 *
 * Note what is **not** imported. `LeaveRequestsModule` exported its service
 * saying "the notifications feature will have to know when a request changes
 * state"; that hand-off is real and is not taken up here. This module does not
 * watch leave requests, timesheets, employees or imports, because it does not
 * decide when a notification is born — the Notification Delivery Engine will,
 * and it will import *this* module rather than the other way round. Wiring the
 * dependency now would have inverted the graph and given this module reasons to
 * change that have nothing to do with storing a message.
 *
 * `EmailModule` is likewise absent, for the same reason: nothing here sends
 * anything.
 *
 * **Two controllers, one service, one repository.** The controllers are two
 * because the personal and administrative workspaces are two inboxes read by
 * different people at different moments; the service is one because the rules
 * they enforce — visibility, addressing, read state — are the same rules, and
 * splitting it would have given the visibility predicate two homes.
 *
 * The repository is the first in this project. It exists because "what may this
 * person see" is one predicate needed by seven operations, and every copy of it
 * would be a way to leak somebody else's mail — see the class for the whole
 * argument.
 *
 * `NotificationService` is exported because the Notification Delivery Engine
 * will create notifications through it rather than by writing the table: that is
 * what keeps the addressing rules — which workspace accepts which recipient
 * type, and which id each requires — enforced in one place however a
 * notification comes to exist. No method is written for that caller in advance.
 */
@Module({
  imports: [UserModule],
  controllers: [NotificationController, AdministrativeNotificationController],
  providers: [NotificationService, NotificationRepository],
  exports: [NotificationService],
})
export class NotificationModule {}
