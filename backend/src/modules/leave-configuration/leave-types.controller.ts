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
import { LeaveTypesService } from './leave-types.service';
import { CreateLeaveTypeDto } from './leave-types/dto/create-leave-type.dto';
import { LeaveTypeQueryDto } from './leave-types/dto/leave-type-query.dto';
import { UpdateLeaveTypeDto } from './leave-types/dto/update-leave-type.dto';
import { LeaveTypeEntity } from './leave-types/entities/leave-type.entity';

/**
 * `/api/v1/leave-types` — the kinds of leave the company recognises. The prefix
 * and the version come from `configureApp`, so only the resource segment is
 * declared here.
 *
 * Plural and top-level, unlike `/work-schedule`: there are many leave types and
 * each is addressable, so this is an ordinary collection rather than a
 * singleton. It is not nested under anything either — a leave type is a
 * vocabulary the whole leave system uses, not a property of some larger
 * configuration object.
 *
 * Every method is a one-line delegation on purpose. Validation is the DTOs' job,
 * the success envelope is the global interceptor's, error rendering is the
 * global filter's, and everything else — uniqueness, existence, the ordering —
 * is the service's.
 *
 * `id` is taken as a plain string: ids are cuids, so `ParseUUIDPipe` would
 * reject valid ones, and a malformed id simply matches no row and yields the
 * same 404 as an id that never existed.
 *
 * Note what is *not* here: no guard, no role check, no notion of who is calling,
 * even though this is administrator-only configuration in practice.
 * Authentication and authorization are later features, and half of an access
 * check is worse than none — it reads as protection while providing none.
 */
@Controller('leave-types')
export class LeaveTypesController {
  constructor(private readonly leaveTypesService: LeaveTypesService) {}

  @Get()
  findAll(
    @Query() query: LeaveTypeQueryDto,
  ): Promise<PaginatedResult<LeaveTypeEntity>> {
    return this.leaveTypesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<LeaveTypeEntity> {
    return this.leaveTypesService.findOne(id);
  }

  /** Answers 201; Nest applies it to `@Post` without a `@HttpCode`. */
  @Post()
  create(@Body() dto: CreateLeaveTypeDto): Promise<LeaveTypeEntity> {
    return this.leaveTypesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeaveTypeDto,
  ): Promise<LeaveTypeEntity> {
    return this.leaveTypesService.update(id, dto);
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
    return this.leaveTypesService.remove(id);
  }
}
