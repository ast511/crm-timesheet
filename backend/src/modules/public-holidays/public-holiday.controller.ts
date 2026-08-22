import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import {
  ApiCreatedEnvelope,
  ApiOkArrayEnvelope,
  ApiOkEnvelope,
  ApiOkNullEnvelope,
  ApiOkPageEnvelope,
} from '../../common/swagger/api-envelope-response.decorator';
import { ApiStandardErrors } from '../../common/swagger/api-standard-errors.decorator';
import { API_TAG } from '../../config/swagger-tags';
import { BEARER_AUTH_NAME } from '../../config/swagger.setup';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
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
 * ## The three writes are gated; the four reads are not
 *
 * Feature 041 gave `POST`, `PATCH` and `DELETE` the catalog's own
 * `PUBLIC_HOLIDAYS.CREATE`, `.EDIT` and `.DELETE`. `HR - Standard` already holds
 * the first two and `HR - Full Access` the third, which is the line this
 * resource was always meant to draw: HR maintains the calendar, and removing a
 * holiday that timesheets have already been filled around is the deliberate act.
 *
 * **The list and the two calendar routes stay ungated.** Nothing in the
 * timesheet actually calls them — `TimesheetFillService` injects
 * `PublicHolidayService` directly and pre-populates a draft server-side, so the
 * caller's permissions are not consulted and cannot be — but they are the
 * company's calendar rather than anybody's private data, and
 * `authorization/routing.spec.ts` pins `GET /public-holidays` open beside
 * `GET /projects` for the same reason.
 *
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 */
@ApiTags(API_TAG.PublicHolidays)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors()
@Controller('public-holidays')
export class PublicHolidayController {
  constructor(private readonly publicHolidayService: PublicHolidayService) {}

  @ApiOperation({
    summary: 'List public holidays',
    description:
      'The stored *definitions*, paginated. A `FIXED` holiday is one row that recurs every year; the resolved calendar for a given year is the two routes below.',
  })
  @ApiOkPageEnvelope(PublicHolidayEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
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
  @ApiOperation({
    summary: 'Resolve a year’s calendar',
    description:
      'Every holiday that actually falls in the year, with `FIXED` definitions expanded onto it and validity ranges applied. Unpaginated — a year holds a dozen or so entries.',
  })
  @ApiOkArrayEnvelope(PublicHolidayOccurrenceEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Get('calendar/:year')
  findYear(
    @Param() { year }: YearParamsDto,
  ): Promise<PublicHolidayOccurrenceEntity[]> {
    return this.publicHolidayService.findYear(year);
  }

  @ApiOperation({
    summary: 'Resolve a month’s calendar',
    description:
      'The same resolution narrowed to one month. `month` is `1`–`12`; January is `1`, not `0`.',
  })
  @ApiOkArrayEnvelope(PublicHolidayOccurrenceEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Get('calendar/:year/:month')
  findMonth(
    @Param() { year, month }: MonthParamsDto,
  ): Promise<PublicHolidayOccurrenceEntity[]> {
    return this.publicHolidayService.findMonth(year, month);
  }

  @ApiOperation({ summary: 'Read one public-holiday definition' })
  @ApiOkEnvelope(PublicHolidayEntity)
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
  @Get(':id')
  findOne(@Param('id') id: string): Promise<PublicHolidayEntity> {
    return this.publicHolidayService.findOne(id);
  }

  /** Answers 201; Nest applies it to `@Post` without a `@HttpCode`. */
  @ApiOperation({
    summary: 'Create a public holiday',
    description:
      'Three rules are the service’s rather than the validation pipe’s, because none is about a single field in isolation: `endDate` must be on or after `startDate`, `isRecurring` must agree with `type`, and the two duplicate rules. All three answer `400`.',
  })
  @ApiCreatedEnvelope(PublicHolidayEntity)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.CONFLICT,
  )
  @Post()
  @RequirePermission('PUBLIC_HOLIDAYS.CREATE')
  create(@Body() dto: CreatePublicHolidayDto): Promise<PublicHolidayEntity> {
    return this.publicHolidayService.create(dto);
  }

  @ApiOperation({
    summary: 'Update a public holiday',
    description:
      'A partial update. The three cross-field rules are re-checked against the values already stored, not only against the ones in the body.',
  })
  @ApiOkEnvelope(PublicHolidayEntity)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  @Patch(':id')
  @RequirePermission('PUBLIC_HOLIDAYS.EDIT')
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
  @ApiOperation({
    summary: 'Delete a public holiday',
    description: 'Answers `200` with `data: null` rather than `204`.',
  })
  @ApiOkNullEnvelope()
  @ApiStandardErrors(HttpStatus.FORBIDDEN, HttpStatus.NOT_FOUND)
  @Delete(':id')
  @RequirePermission('PUBLIC_HOLIDAYS.DELETE')
  remove(@Param('id') id: string): Promise<void> {
    return this.publicHolidayService.remove(id);
  }
}
