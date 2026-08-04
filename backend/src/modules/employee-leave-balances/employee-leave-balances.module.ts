import { Module } from '@nestjs/common';

import { EmployeeModule } from '../employees/employee.module';
import { LeaveConfigurationModule } from '../leave-configuration/leave-configuration.module';
import { EmployeeLeaveBalancesController } from './employee-leave-balances.controller';
import { EmployeeLeaveBalancesService } from './employee-leave-balances.service';

/**
 * The employee-leave-balances feature.
 *
 * `PrismaModule` is not imported: it is `@Global`, so `PrismaService` is
 * injectable here without the repetition every feature module would otherwise
 * carry. The other two *are* imported, because a balance is defined by what it
 * points at, and each of those modules owns a table this one must confirm before
 * writing — `EmployeeService.findStatus` and `LeaveTypesService.exists`, both
 * exported for exactly this. Neither imports this module back, so the graph
 * stays acyclic and no `forwardRef` is needed; that is the difference from
 * `EmployeeModule` ⇄ `ProjectMemberModule`, where terminating a person has to
 * write the other table.
 *
 * `LeaveConfigurationModule` is where Feature 021 said this would go: leave
 * types are a vocabulary the whole leave system reads, and the balances are its
 * first consumer.
 *
 * `EmployeeLeaveBalancesService` is exported because the Leave Requests feature
 * is the next consumer and a much larger one: approving a request has to find
 * the right balance, check what is left in it, and move `usedDays`. No method is
 * written for that here in advance — what those questions look like belongs to
 * the feature that asks them, and guessing at the signature now would be writing
 * code against a design nobody has settled.
 */
@Module({
  imports: [EmployeeModule, LeaveConfigurationModule],
  controllers: [EmployeeLeaveBalancesController],
  providers: [EmployeeLeaveBalancesService],
  exports: [EmployeeLeaveBalancesService],
})
export class EmployeeLeaveBalancesModule {}
