import { Module } from '@nestjs/common';

import { DepartmentController } from './department.controller';
import { DepartmentService } from './department.service';

/**
 * The departments feature.
 *
 * `PrismaModule` is not imported: it is `@Global`, so `PrismaService` is
 * injectable here without the repetition every future module would otherwise
 * carry.
 *
 * `DepartmentService` is exported because the modules that follow — Employees
 * first — need to confirm a department exists before assigning someone to it,
 * and should ask this module rather than query the `departments` table
 * themselves.
 */
@Module({
  controllers: [DepartmentController],
  providers: [DepartmentService],
  exports: [DepartmentService],
})
export class DepartmentModule {}
