import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import { CreatePublicHolidayDto } from './dto/create-public-holiday.dto';
import { MonthParamsDto } from './dto/month-params.dto';
import { PublicHolidayQueryDto } from './dto/public-holiday-query.dto';
import { UpdatePublicHolidayDto } from './dto/update-public-holiday.dto';
import { YearParamsDto } from './dto/year-params.dto';
import { PublicHolidayOccurrenceEntity } from './entities/public-holiday-occurrence.entity';
import { PublicHolidayEntity } from './entities/public-holiday.entity';
import { PublicHolidayService } from './public-holiday.service';

/**
 * `/api/v1/public-holidays` — the prefix and the version come from
 * `configureApp`, so only the resource segment is declared here.
 *
 * Every method is a one-line delegation on purpose. Validation is the DTOs'
 * job, the success envelope is the global interceptor's, error rendering is the
 * global filter's, and everything else — the ordering of the two dates, the
 * recurrence rule, the two duplicate rules — is the service's; a controller
 * that did any of it here would be the one place those decisions could drift.
 *
 * Note what is *not* here: no guard, no role check, no notion of who is
 * calling. Authentication and authorization are later features, and half of an
 * access check is worse than none — it reads as protection while providing
 * none.
 *
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 */
@Controller('public-holidays')
export class PublicHolidayController {
  constructor(private readonly publicHolidayService: PublicHolidayService) {}

  @Get()
  findAll(
    @Query() query: PublicHolidayQueryDto,
  ): Promise<PaginatedResult<PublicHolidayEntity>> {
    return this.publicHolidayService.findAll(query);
  }

  /**
   * The two calendar routes are declared **before** `:id`.
   *
   * Nest matches in declaration order, and while `/calendar/2027` could not
   * collide with a one-segment `:id` anyway, relying on that would make the
   * safety of these routes a fact about how many segments they happen to have.
   * Declaring them first states the intent instead, and `routing.spec.ts`
   * checks the resolution rather than trusting this comment.
   */
  @Get('calendar/:year')
  findYear(
    @Param() { year }: YearParamsDto,
  ): Promise<PublicHolidayOccurrenceEntity[]> {
    return this.publicHolidayService.findYear(year);
  }

  @Get('calendar/:year/:month')
  findMonth(
    @Param() { year, month }: MonthParamsDto,
  ): Promise<PublicHolidayOccurrenceEntity[]> {
    return this.publicHolidayService.findMonth(year, month);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<PublicHolidayEntity> {
    return this.publicHolidayService.findOne(id);
  }

  /** Answers 201; Nest applies it to `@Post` without a `@HttpCode`. */
  @Post()
  create(@Body() dto: CreatePublicHolidayDto): Promise<PublicHolidayEntity> {
    return this.publicHolidayService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePublicHolidayDto,
  ): Promise<PublicHolidayEntity> {
    return this.publicHolidayService.update(id, dto);
  }

  /**
   * Answers 200 with `{ "success": true, "data": null }` rather than 204.
   *
   * A 204 would have to carry an empty body, making this the one endpoint whose
   * response is not the envelope — Feature 006 chose the explicit `data: null`
   * so a client reads the same two fields whatever it called.
   */
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.publicHolidayService.remove(id);
  }
}
