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
  ApiOkEnvelope,
  ApiOkNullEnvelope,
  ApiOkPageEnvelope,
} from '../../common/swagger/api-envelope-response.decorator';
import { ApiStandardErrors } from '../../common/swagger/api-standard-errors.decorator';
import { API_TAG } from '../../config/swagger-tags';
import { BEARER_AUTH_NAME } from '../../config/swagger.setup';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CreatePositionDto } from './dto/create-position.dto';
import { PositionQueryDto } from './dto/position-query.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { PositionEntity } from './entities/position.entity';
import { PositionService } from './position.service';

/**
 * `/api/v1/positions` — the prefix and the version come from `configureApp`,
 * so only the resource segment is declared here.
 *
 * Every method is a one-line delegation on purpose. Validation is the DTOs'
 * job, the success envelope is the global interceptor's, error rendering is the
 * global filter's, and everything else is the service's; a controller that did
 * any of it here would be the one place those decisions could drift.
 *
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 *
 * The `@Api*` decorators added by Feature 038 describe this controller and
 * change nothing about it.
 *
 * ## The writes are gated on `EMPLOYEES.*`, and that needs explaining
 *
 * **There is no `POSITIONS` resource in the permission catalog.** Feature 029
 * seeded twelve resources and this is not one of them — `DEPARTMENTS` got a row
 * of its own and job titles did not — so Feature 041's sweep arrived here with no
 * key to name. Three things could have happened, and the choice matters:
 *
 * 1. Invent `POSITIONS.CREATE`. Rejected: a `@RequirePermission()` naming a key
 *    the seed never creates is the worst failure mode in this system — it looks
 *    like an access rule and refuses everybody but a super-admin, permanently,
 *    because no grant can satisfy it. `authorization/catalog.spec.ts` exists to
 *    make that a failing test.
 * 2. Add the enum value. That is a `schema.prisma` change and a migration, which
 *    a code-only security sweep must not smuggle in. It is recorded as a future
 *    improvement instead.
 * 3. Gate on the resource a position actually belongs to. This is what happened.
 *
 * A position is not a screen and not a thing anybody administers on its own: it
 * is a column on an employee, maintained by whoever maintains the directory, and
 * the frontend has no positions page at all. So `POST`, `PATCH` and `DELETE`
 * require `EMPLOYEES.CREATE`, `EMPLOYEES.EDIT` and `EMPLOYEES.DELETE` — the same
 * keys, at the same tiers, as the records these rows are referenced by. HR keeps
 * adding and renaming job titles; deleting one, which is refused anyway while an
 * employee still holds it, needs the `Full Access` tier.
 *
 * It is a deliberate approximation rather than a claim that the two resources are
 * the same, and the day a `POSITIONS` resource is seeded these three lines are
 * what changes.
 */
@ApiTags(API_TAG.Positions)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors()
@Controller('positions')
export class PositionController {
  constructor(private readonly positionService: PositionService) {}

  @ApiOperation({
    summary: 'List positions',
    description: 'Paginated, filterable and sortable; ordered by `name`.',
  })
  @ApiOkPageEnvelope(PositionEntity)
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Get()
  findAll(
    @Query() query: PositionQueryDto,
  ): Promise<PaginatedResult<PositionEntity>> {
    return this.positionService.findAll(query);
  }

  @ApiOperation({ summary: 'Read one position' })
  @ApiOkEnvelope(PositionEntity)
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
  @Get(':id')
  findOne(@Param('id') id: string): Promise<PositionEntity> {
    return this.positionService.findOne(id);
  }

  /** Answers 201; Nest applies it to `@Post` without a `@HttpCode`. */
  @ApiOperation({
    summary: 'Create a position',
    description:
      '`code` is trimmed and upper-cased before the uniqueness check, so `dev` and `DEV` are the same position.',
  })
  @ApiCreatedEnvelope(PositionEntity)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.CONFLICT,
  )
  @Post()
  @RequirePermission('EMPLOYEES.CREATE')
  create(@Body() dto: CreatePositionDto): Promise<PositionEntity> {
    return this.positionService.create(dto);
  }

  @ApiOperation({
    summary: 'Update a position',
    description:
      'A partial update: only the fields present in the body are changed.',
  })
  @ApiOkEnvelope(PositionEntity)
  @ApiStandardErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  @Patch(':id')
  @RequirePermission('EMPLOYEES.EDIT')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePositionDto,
  ): Promise<PositionEntity> {
    return this.positionService.update(id, dto);
  }

  /**
   * Answers 200 with `{ "success": true, "data": null }` rather than 204.
   *
   * A 204 would have to carry an empty body, making this the one endpoint whose
   * response is not the envelope — Feature 006 chose the explicit `data: null`
   * so a client reads the same two fields whatever it called.
   */
  @ApiOperation({
    summary: 'Delete a position',
    description:
      'Refused with a `409` while any employee still holds it. Answers `200` with `data: null` rather than `204`.',
  })
  @ApiOkNullEnvelope()
  @ApiStandardErrors(
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  @Delete(':id')
  @RequirePermission('EMPLOYEES.DELETE')
  remove(@Param('id') id: string): Promise<void> {
    return this.positionService.remove(id);
  }
}
