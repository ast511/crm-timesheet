import {
  BadRequestException,
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
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import {
  PROJECT_PUBLIC_SELECT,
  ProjectEntity,
  PublicProjectRow,
  toProjectEntity,
} from './entities/project.entity';
import { ProjectSortField } from './project.constants';

/**
 * Makes PostgreSQL fold the case of both operands, so `crm` finds `CRM-TS`.
 * Extracted because getting it wrong on one of the comparisons below would
 * produce a search or a duplicate check that quietly behaves differently from
 * the others.
 */
const CASE_INSENSITIVE = { mode: 'insensitive' } as const;

/** Both ends of a project's schedule, as the columns hold them. */
interface DateRange {
  readonly startDate: Date | null;
  readonly endDate: Date | null;
}

/**
 * Every rule about projects lives here; the controller only routes.
 *
 * Three of them are worth naming, because they are what makes this more than a
 * fifth copy of the same CRUD shape:
 *
 * 1. **A project's schedule is one value spread over two columns.** `endDate`
 *    is only meaningful relative to `startDate`, so the check cannot live in a
 *    DTO — a `PATCH` that moves one end has to be judged against the end
 *    already stored. {@link resolveDateRange} reconstructs both, then
 *    {@link assertOrderedDateRange} judges them.
 * 2. **Archiving is not deleting, and it is not the lifecycle.** `isArchived`
 *    is an ordinary editable column: an archived project still answers `GET`,
 *    still appears in a listing, and still accepts a `PATCH`. It is also the
 *    only remaining boolean — Feature 012 dropped `isActive`, whose value was
 *    always recomputable from `projectStatus` and which therefore gave the same
 *    fact two places to disagree. Archiving stays separate because it is
 *    genuinely a second axis: a completed project and a cancelled one can both
 *    be archived, and the difference between them survives it.
 * 3. **Deleting is refused while memberships exist.** Which is a rule about
 *    history, not about referential integrity — see {@link ProjectService.remove}.
 */
@Injectable()
export class ProjectService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of projects, narrowed by `search` and the three filters, ordered
   * by `sortBy`.
   *
   * The rows and the total are read in a single `$transaction` so both see the
   * same snapshot: run separately, a concurrent insert between them would
   * produce a `total` that does not describe the page just returned.
   */
  async findAll(
    query: ProjectQueryDto,
  ): Promise<PaginatedResult<ProjectEntity>> {
    const where = buildWhere(query);

    const [projects, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        select: PROJECT_PUBLIC_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.project.count({ where }),
    ]);

    return buildPaginatedResult(projects.map(toProjectEntity), total, query);
  }

  async findOne(id: string): Promise<ProjectEntity> {
    return toProjectEntity(await this.findOrThrow(id));
  }

  /**
   * Creates a project, once its code is free and its dates make sense.
   *
   * The schedule is checked before the code so the cheap, purely local answer
   * comes first: a body that contradicts itself is a `400` and never reaches
   * the database, and only a coherent body goes on to conflict with an existing
   * project.
   */
  async create(dto: CreateProjectDto): Promise<ProjectEntity> {
    const range = resolveDateRange(dto, { startDate: null, endDate: null });

    assertOrderedDateRange(range);
    await this.assertCodeIsFree(dto.code);

    const created = await this.prisma.project.create({
      data: {
        code: dto.code,
        name: dto.name,
        clientName: dto.clientName,
        description: dto.description,
        estimatedHours: dto.estimatedHours,
        color: dto.color,
        projectStatus: dto.projectStatus,
        projectPriority: dto.projectPriority,
        isArchived: dto.isArchived,
        ...range,
      },
      select: PROJECT_PUBLIC_SELECT,
    });

    return toProjectEntity(created);
  }

  /**
   * Applies a partial update.
   *
   * Existence is checked first, so patching a missing id reports the missing id
   * rather than a complaint about the body — and the row it loads is what the
   * date check needs: a body carrying only `endDate` is judged against the
   * `startDate` already stored, and clearing `startDate` lifts the constraint
   * instead of failing against a value that is no longer there.
   *
   * The project's own id is excluded from the uniqueness check, so re-sending
   * the code it already holds is not a conflict with itself.
   */
  async update(id: string, dto: UpdateProjectDto): Promise<ProjectEntity> {
    const current = await this.findOrThrow(id);
    const range = resolveDateRange(dto, current);

    assertOrderedDateRange(range);
    await this.assertCodeIsFree(dto.code, id);

    const updated = await this.prisma.project.update({
      where: { id },
      // `undefined` is omitted from the UPDATE by Prisma, so an absent field is
      // left alone while an explicit `null` clears the column. The two dates
      // are resolved values, so they are written only when the body mentioned
      // them — otherwise the row would be rewritten with what it already holds.
      data: {
        code: dto.code,
        name: dto.name,
        clientName: dto.clientName,
        description: dto.description,
        estimatedHours: dto.estimatedHours,
        color: dto.color,
        projectStatus: dto.projectStatus,
        projectPriority: dto.projectPriority,
        isArchived: dto.isArchived,
        startDate: dto.startDate === undefined ? undefined : range.startDate,
        endDate: dto.endDate === undefined ? undefined : range.endDate,
      },
      select: PROJECT_PUBLIC_SELECT,
    });

    return toProjectEntity(updated);
  }

  /**
   * Hard-deletes a project nothing depends on.
   *
   * Two relations are counted rather than cascaded, for the same reason:
   *
   * - **Memberships** record that somebody worked on this project, and deleting
   *   them to remove a project entry would rewrite that person's history.
   * - **Timesheet entries** record the hours actually booked to it. Added by
   *   Feature 030, which is the "feature that adds time entries" this method was
   *   written in anticipation of, and it is the stronger of the two: an entry on
   *   an approved timesheet is part of a month the company signed off, so
   *   removing the project underneath it would silently drop the hours behind an
   *   invoice.
   *
   * The `409` asks the caller to clear whichever count is in the way, or to
   * archive the project instead — which is what `isArchived` is for, and a
   * decision only a human should make.
   *
   * Both counts are part of the existence query, so the common case is one round
   * trip and a `404` and a `409` cannot be decided from two different snapshots.
   * Each is also backed by `ON DELETE RESTRICT` in the schema: without this check
   * the database would refuse the delete anyway, but as a driver error surfacing
   * as a `500` rather than a message naming what is in the way.
   */
  async remove(id: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: {
        _count: { select: { memberships: true, timesheetEntries: true } },
      },
    });

    if (project === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    const { memberships, timesheetEntries } = project._count;

    if (memberships > 0) {
      throw new ConflictException(
        `Project ${id} cannot be deleted while ${memberships} project member(s) reference it`,
      );
    }

    if (timesheetEntries > 0) {
      throw new ConflictException(
        `Project ${id} cannot be deleted while ${timesheetEntries} timesheet entry(s) reference it`,
      );
    }

    await this.prisma.project.delete({ where: { id } });
  }

  /**
   * Whether a project with this id exists.
   *
   * Public because the project-members feature has to confirm a project before
   * assigning anyone to it, and this module owns the `projects` table — the
   * same hand-off `DepartmentService` and `PositionService` make to Employees.
   * It returns a boolean rather than throwing, because the caller knows what a
   * missing project means in its own request; here it would only be able to
   * guess.
   *
   * `id` alone is selected: the caller needs a yes or a no, not a row.
   *
   * See {@link findExistingIds} for the same question asked of a set.
   */
  async exists(id: string): Promise<boolean> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true },
    });

    return project !== null;
  }

  /**
   * Which of these projects exist, as a list of the ids that were found.
   *
   * Public for the reason {@link exists} is — this module owns the `projects`
   * table, so another module confirms a project through it rather than by
   * querying the table — and separate from it because the question is genuinely
   * different: `exists` asks about one project and this asks about a *set*. The
   * same pair `EmployeeService` keeps, and added by the same kind of caller:
   * Feature 030's fill-in engine validates a month whose entries may name a
   * dozen projects across thirty days, and one `exists` per line would be sixty
   * round trips to answer three questions.
   *
   * It returns the ids that were found rather than the ones that were not,
   * because only the caller knows what a missing project means in its own request
   * — a `400` naming a body field, for a timesheet — and what to say about it.
   *
   * `isArchived` is deliberately not filtered on. "Does this project exist" and
   * "is it still being worked on" are different questions, and folding the second
   * in here would make a caller that only asked the first treat an archived
   * project as a typo — which matters for a timesheet in particular, since a month
   * being filled in late may legitimately book hours to a project archived since.
   */
  async findExistingIds(ids: readonly string[]): Promise<string[]> {
    const projects = await this.prisma.project.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true },
    });

    return projects.map(({ id }) => id);
  }

  /** Loads a project by id or reports it missing. */
  private async findOrThrow(id: string): Promise<PublicProjectRow> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: PROJECT_PUBLIC_SELECT,
    });

    if (project === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    return project;
  }

  /**
   * Rejects a code already taken by another project.
   *
   * The comparison is case-insensitive because `crm-ts` and `CRM-TS` are the
   * same code to a human, while PostgreSQL's unique index sees two rows. That
   * index still backs this check for the exact-case race between the read and
   * the write — and the DTO upper-cases before either, so in practice the gap is
   * closed.
   *
   * Only `code` is checked: it is the sole unique column on `projects`. Two
   * clients really can both have a project called "Website Redesign", so
   * `name` is deliberately not treated as an identifier.
   *
   * `excludeId` is the project being updated, which must not conflict with
   * itself. An absent code — a patch that does not touch it — skips the query.
   */
  private async assertCodeIsFree(
    code?: string,
    excludeId?: string,
  ): Promise<void> {
    if (code === undefined) {
      return;
    }

    const conflict = await this.prisma.project.findFirst({
      where: {
        code: { equals: code, ...CASE_INSENSITIVE },
        ...(excludeId === undefined ? {} : { NOT: { id: excludeId } }),
      },
      select: { id: true },
    });

    if (conflict !== null) {
      throw new ConflictException(
        `A project with code "${code}" already exists`,
      );
    }
  }
}

/** Message used for every 404 path, so they cannot drift apart. */
function notFoundMessage(id: string): string {
  return `Project ${id} was not found`;
}

/** The dates a write carries: absent means "unchanged", `null` means "clear". */
interface DateRangePatch {
  readonly startDate?: string | null;
  readonly endDate?: string | null;
}

/**
 * Works out the schedule a write would leave behind.
 *
 * Each end is taken from the body when the body mentions it, and from the row
 * otherwise — which is the whole reason the rule cannot live in a DTO. Three
 * cases have to come out right, and only this function sees all three:
 *
 * - `PATCH { endDate }` — compared against the stored `startDate`, not against
 *   nothing.
 * - `PATCH { startDate: null }` — the constraint is lifted, because an open
 *   start cannot be violated by any end.
 * - `POST` — `current` is an empty range, so the body is judged on its own.
 *
 * The ISO strings the DTO validated are parsed here, once, on their way to the
 * `timestamp` columns.
 */
function resolveDateRange(
  { startDate, endDate }: DateRangePatch,
  current: DateRange,
): DateRange {
  return {
    startDate: resolveDate(startDate, current.startDate),
    endDate: resolveDate(endDate, current.endDate),
  };
}

function resolveDate(patched: string | null | undefined, current: Date | null) {
  if (patched === undefined) {
    return current;
  }

  return patched === null ? null : new Date(patched);
}

/**
 * Rejects a schedule that ends before it starts.
 *
 * An open end — either date missing — is not a violation but an unknown, so the
 * rule only applies when both are present. The comparison is `<`, so a project
 * that starts and finishes on the same day is allowed: a one-day engagement is
 * real, and `endDate === startDate` is not "before".
 *
 * A `400` rather than a `409`: nothing in the database conflicts with this
 * request, the submitted range simply contradicts itself. The message is an
 * array, the same shape the `ValidationPipe` produces, so a form handles it
 * with the code it already has for field errors.
 */
function assertOrderedDateRange({ startDate, endDate }: DateRange): void {
  if (startDate === null || endDate === null) {
    return;
  }

  if (endDate.getTime() < startDate.getTime()) {
    throw new BadRequestException(['endDate must not be before startDate']);
  }
}

/**
 * Builds the `WHERE` for the list endpoint.
 *
 * The parameters are independent and combine with `AND`: `?isArchived=false`
 * narrows whatever `?search=` matched rather than replacing it. Returns
 * `undefined` — not an empty object — when nothing was requested, because
 * `undefined` is what `findMany` and `count` both read as "no filter", and the
 * two must agree or the total would not describe the page.
 */
function buildWhere({
  search,
  isArchived,
  projectStatus,
  projectPriority,
}: ProjectQueryDto): Prisma.ProjectWhereInput | undefined {
  const filters: Prisma.ProjectWhereInput[] = [];

  if (search !== undefined && search.length > 0) {
    filters.push({
      OR: [
        { code: { contains: search, ...CASE_INSENSITIVE } },
        { name: { contains: search, ...CASE_INSENSITIVE } },
        { clientName: { contains: search, ...CASE_INSENSITIVE } },
      ],
    });
  }

  if (isArchived !== undefined) {
    filters.push({ isArchived });
  }

  if (projectStatus !== undefined) {
    filters.push({ projectStatus });
  }

  if (projectPriority !== undefined) {
    filters.push({ projectPriority });
  }

  return filters.length === 0 ? undefined : { AND: filters };
}

/**
 * Orders by the requested column, then by `id`.
 *
 * The tie-break is what makes pagination safe: of the six sortable columns only
 * `code` is unique, and two projects sharing a client, an estimate or a start
 * date could otherwise be returned in a different relative order on each query,
 * letting a record repeat on one page and vanish from the next.
 */
function buildOrderBy(
  sortBy: ProjectSortField,
  sortOrder: SortOrder,
): Prisma.ProjectOrderByWithRelationInput[] {
  return [{ [sortBy]: sortOrder }, { id: SortOrder.ASC }];
}
