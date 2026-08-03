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
 */
@Controller('positions')
export class PositionController {
  constructor(private readonly positionService: PositionService) {}

  @Get()
  findAll(
    @Query() query: PositionQueryDto,
  ): Promise<PaginatedResult<PositionEntity>> {
    return this.positionService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<PositionEntity> {
    return this.positionService.findOne(id);
  }

  /** Answers 201; Nest applies it to `@Post` without a `@HttpCode`. */
  @Post()
  create(@Body() dto: CreatePositionDto): Promise<PositionEntity> {
    return this.positionService.create(dto);
  }

  @Patch(':id')
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
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.positionService.remove(id);
  }
}
