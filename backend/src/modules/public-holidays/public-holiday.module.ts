import { Module } from '@nestjs/common';

import { PublicHolidayController } from './public-holiday.controller';
import { PublicHolidayService } from './public-holiday.service';

/**
 * The public-holidays feature.
 *
 * `PrismaModule` is not imported: it is `@Global`, so `PrismaService` is
 * injectable here without the repetition every feature module would otherwise
 * carry. Nothing else is imported either — a holiday stands on its own, with no
 * relation to an employee, a project or the work schedule, which is why this
 * module is a leaf of the graph rather than a node in it.
 *
 * `PublicHolidayService` is exported for the same reason the other services
 * are: Timesheets and Vacations both have to know which days the company is
 * closed before they can judge an entry or count a leave day, and they should
 * ask this module rather than reach into the `public_holidays` table
 * themselves. What that question looks like — "is this date a holiday", "how
 * many working days are between these two" — belongs to the feature that asks
 * it, so no method is written for it here in advance.
 */
@Module({
  controllers: [PublicHolidayController],
  providers: [PublicHolidayService],
  exports: [PublicHolidayService],
})
export class PublicHolidayModule {}
