import { Module } from '@nestjs/common';

import { DepartmentModule } from '../departments/department.module';
import { PositionModule } from '../positions/position.module';
import { UserModule } from '../users/user.module';
import { EmployeeController } from './employee.controller';
import { EmployeeService } from './employee.service';

/**
 * The employees feature.
 *
 * `PrismaModule` is not imported: it is `@Global`, so `PrismaService` is
 * injectable here without the repetition every future module would otherwise
 * carry. The other three *are* imported, because this is the module that
 * finally uses what they export — each of them documented, when it was written,
 * that Employees should confirm a referenced row through its service rather
 * than query its table directly. None of the three imports this module back, so
 * the graph stays acyclic.
 *
 * `EmployeeService` is exported for the same reason: project memberships,
 * vacations and time entries all hang off an employee and will each need to
 * confirm one exists before recording anything against it.
 */
@Module({
  imports: [UserModule, DepartmentModule, PositionModule],
  controllers: [EmployeeController],
  providers: [EmployeeService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
