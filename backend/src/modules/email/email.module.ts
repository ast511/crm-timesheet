import { Module } from '@nestjs/common';

import { EmailController } from './email.controller';
import { EmailService } from './email.service';

/**
 * The email infrastructure.
 *
 * Infrastructure rather than a feature: it owns no table, no resource and no
 * business rule, and it is the first module in the project of which that is
 * true. What it provides is a capability — delivery — that later features will
 * spend and this one deliberately does not.
 *
 * Nothing is imported. `ConfigModule` is global, so `ConfigService` is
 * injectable here without repetition, and `PrismaModule` is not needed at all:
 * the SMTP settings come from the environment and this module reads no table.
 * That emptiness is the architectural property worth protecting — the module
 * depends on no employee, no project, no leave request and no notification, so
 * anything may depend on it without creating a cycle.
 *
 * `EmailService` is exported because the modules that will actually have
 * something to say — leave notifications, timesheet reminders, the notification
 * centre — inject it. No method was added in advance for any of them: `send`
 * and `sendMany` are what a sender needs, and guessing at a
 * `sendLeaveApproval()` would put a leave rule inside the transport.
 */
@Module({
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
