import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { SortOrder } from '../../common/enums/sort-order.enum';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import {
  buildPaginatedResult,
  toSkipTake,
} from '../../common/utils/pagination.util';
import type { Prisma } from '../../generated/prisma/client';
import type { PositionModel } from '../../generated/prisma/models';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { PositionQueryDto } from './dto/position-query.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { PositionSortField } from './position.constants';
import { PositionEntity, toPositionEntity } from './entities/position.entity';

/**
 * Makes PostgreSQL fold the case of both operands, so `dev` finds `DEV`.
 * Extracted because getting it wrong on one of the four comparisons below
 * would produce a search or a duplicate check that quietly behaves differently
 * from the others.
 */
const CASE_INSENSITIVE = { mode: 'insensitive' } as const;

/** The unique fields a position can collide on. */
type UniquePositionFields = Pick<UpdatePositionDto, 'code' | 'name'>;

/**
 * Every rule about positions lives here; the controller only routes.
 *
 * The three private helpers at the bottom exist so that "does it exist",
 * "is the code free" and "how is this list ordered" are each written once and
 * called from wherever they are needed, rather than being re-expressed as a
 * slightly different Prisma query in each public method.
 */
@Injectable()
export class PositionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of positions, filtered by `search` and ordered by `sortBy`.
   *
   * The rows and the total are read in a single `$transaction` so both see the
   * same snapshot: run separately, a concurrent insert between them would
   * produce a `total` that does not describe the page just returned.
   */
  async findAll(
    query: PositionQueryDto,
  ): Promise<PaginatedResult<PositionEntity>> {
    const where = buildSearchFilter(query.search);

    const [positions, total] = await this.prisma.$transaction([
      this.prisma.position.findMany({
        where,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        ...toSkipTake(query),
      }),
      this.prisma.position.count({ where }),
    ]);

    return buildPaginatedResult(positions.map(toPositionEntity), total, query);
  }

  async findOne(id: string): Promise<PositionEntity> {
    return toPositionEntity(await this.findOrThrow(id));
  }

  async create(dto: CreatePositionDto): Promise<PositionEntity> {
    await this.assertCodeAndNameAreFree(dto);

    const created = await this.prisma.position.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive,
      },
    });

    return toPositionEntity(created);
  }

  /**
   * Applies a partial update.
   *
   * Existence is checked before uniqueness so that patching a missing id
   * reports the missing id, rather than a conflict with whichever position
   * happens to own the submitted code.
   */
  async update(id: string, dto: UpdatePositionDto): Promise<PositionEntity> {
    await this.findOrThrow(id);
    await this.assertCodeAndNameAreFree(dto, id);

    const updated = await this.prisma.position.update({
      where: { id },
      // `undefined` is omitted from the UPDATE by Prisma, so an absent field is
      // left alone while an explicit `null` description clears the column.
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive,
      },
    });

    return toPositionEntity(updated);
  }

  /**
   * Hard-deletes a position that nothing depends on.
   *
   * Employees are counted rather than cascaded: a position with staff is a
   * reporting dimension for their history, and removing it would either orphan
   * those rows or delete people to delete a label. The 409 asks the caller to
   * reassign or deactivate first.
   *
   * The count is part of the existence query, so the common case is one round
   * trip and a 404 and a 409 cannot be decided from two different snapshots.
   */
  async remove(id: string): Promise<void> {
    const position = await this.prisma.position.findUnique({
      where: { id },
      select: { _count: { select: { employees: true } } },
    });

    if (position === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    const { employees } = position._count;

    if (employees > 0) {
      throw new ConflictException(
        `Position ${id} cannot be deleted while ${employees} employee(s) are assigned to it`,
      );
    }

    await this.prisma.position.delete({ where: { id } });
  }

  /** Loads a position by id or reports it missing. */
  private async findOrThrow(id: string): Promise<PositionModel> {
    const position = await this.prisma.position.findUnique({ where: { id } });

    if (position === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    return position;
  }

  /**
   * Rejects a code or a name already taken by another position.
   *
   * Both fields are checked in one query, and both conflicts are reported at
   * once — as an array, the same shape the `ValidationPipe` produces — so a
   * form can mark each offending input instead of discovering the second
   * problem only after fixing the first.
   *
   * The comparison is case-insensitive because `Developer` and `developer` are
   * the same position to a human, while PostgreSQL's unique index sees two
   * rows. That index still backs this check for the exact-case race between the
   * read and the write; a case-variant race would slip past both and needs a
   * citext column or a functional index to close — a schema change, out of
   * scope here.
   *
   * `excludeId` is the position being updated, which must not conflict with
   * itself.
   */
  private async assertCodeAndNameAreFree(
    { code, name }: UniquePositionFields,
    excludeId?: string,
  ): Promise<void> {
    const candidates: Prisma.PositionWhereInput[] = [];

    if (code !== undefined) {
      candidates.push({ code: { equals: code, ...CASE_INSENSITIVE } });
    }

    if (name !== undefined) {
      candidates.push({ name: { equals: name, ...CASE_INSENSITIVE } });
    }

    // A patch touching neither field has nothing to collide with.
    if (candidates.length === 0) {
      return;
    }

    const conflicts = await this.prisma.position.findMany({
      where: {
        OR: candidates,
        ...(excludeId === undefined ? {} : { NOT: { id: excludeId } }),
      },
      select: { code: true, name: true },
    });

    if (conflicts.length === 0) {
      return;
    }

    throw new ConflictException(describeConflicts(conflicts, { code, name }));
  }
}

/** Message used for both the 404 paths, so they cannot drift apart. */
function notFoundMessage(id: string): string {
  return `Position ${id} was not found`;
}

/**
 * Builds the `WHERE` for `?search=`.
 *
 * Returns `undefined` — not an empty object — when there is nothing to search
 * for, because `undefined` is what `findMany` and `count` both read as "no
 * filter", and the two must agree or the total would not describe the page.
 */
function buildSearchFilter(
  search?: string,
): Prisma.PositionWhereInput | undefined {
  if (search === undefined || search.length === 0) {
    return undefined;
  }

  return {
    OR: [
      { code: { contains: search, ...CASE_INSENSITIVE } },
      { name: { contains: search, ...CASE_INSENSITIVE } },
    ],
  };
}

/**
 * Orders by the requested column, then by `id`.
 *
 * The tie-break is what makes pagination safe: `createdAt` is not unique, and
 * two rows sharing a value could otherwise be returned in a different relative
 * order on each query, letting a record repeat on one page and vanish from the
 * next.
 */
function buildOrderBy(
  sortBy: PositionSortField,
  sortOrder: SortOrder,
): Prisma.PositionOrderByWithRelationInput[] {
  return [{ [sortBy]: sortOrder }, { id: SortOrder.ASC }];
}

/** Names which of the submitted fields are already taken. */
function describeConflicts(
  conflicts: readonly UniquePositionFields[],
  { code, name }: UniquePositionFields,
): string[] {
  const messages: string[] = [];

  if (
    code !== undefined &&
    conflicts.some((it) => equalsIgnoringCase(it.code, code))
  ) {
    messages.push(`A position with code "${code}" already exists`);
  }

  if (
    name !== undefined &&
    conflicts.some((it) => equalsIgnoringCase(it.name, name))
  ) {
    messages.push(`A position with name "${name}" already exists`);
  }

  // Reached only if PostgreSQL and JavaScript disagree about case folding for
  // some character; the row is a genuine conflict either way, so it is reported
  // rather than swallowed into a 500.
  return messages.length > 0
    ? messages
    : ['A position with this code or name already exists'];
}

function equalsIgnoringCase(left: string | undefined, right: string): boolean {
  return left?.toLowerCase() === right.toLowerCase();
}
