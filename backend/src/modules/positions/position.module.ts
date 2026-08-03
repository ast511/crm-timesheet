import { Module } from '@nestjs/common';

import { PositionController } from './position.controller';
import { PositionService } from './position.service';

/**
 * The positions feature.
 *
 * `PrismaModule` is not imported: it is `@Global`, so `PrismaService` is
 * injectable here without the repetition every future module would otherwise
 * carry.
 *
 * `PositionService` is exported because the modules that follow — Employees
 * first — need to confirm a position exists before assigning someone to it,
 * and should ask this module rather than query the `positions` table
 * themselves.
 */
@Module({
  controllers: [PositionController],
  providers: [PositionService],
  exports: [PositionService],
})
export class PositionModule {}
