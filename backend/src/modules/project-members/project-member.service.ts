import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { SortOrder } from '../../common/enums/sort-order.enum';
import {
  buildPaginatedResult,
  toSkipTake,
} from '../../common/utils/pagination.util';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeeService } from '../employees/employee.service';
import { ProjectService } from '../projects/project.service';
import { CreateProjectMemberDto } from './dto/create-project-member.dto';
import { ProjectMemberQueryDto } from './dto/project-member-query.dto';
import { UpdateProjectMemberDto } from './dto/update-project-member.dto';
import { EmployeeProjectsEntity } from './entities/employee-projects.entity';
import {
  PROJECT_MEMBER_ASSIGNMENT_SELECT,
  PROJECT_MEMBER_ROSTER_SELECT,
  ProjectMemberRosterEntry,
  ProjectMemberRosterRow,
  toProjectMemberAssignmentEntry,
  toProjectMemberRosterEntry,
} from './entities/project-member.entity';
import { ProjectRosterEntity } from './entities/project-roster.entity';
import { ProjectMemberSortField } from './project-member.constants';

/** How long somebody was on a project, as the columns hold it. */
interface MembershipPeriod {
  readonly joinedAt: Date;
  readonly leftAt: Date | null;
}

/**
 * Every rule about project memberships lives here; the controllers only route.
 *
 * This module is the join between two others, and three things follow from that
 * which none of the five single-table modules had to deal with:
 *
 * 1. **The identity is a pair, not an id.** `@@id([projectId, employeeId])`
 *    means every read and write addresses the row through
 *    {@link membershipKey}, and it means the database itself refuses a second
 *    membership for the same pair — see
 *    {@link ProjectMemberService.assertNotAlreadyAssigned}.
 * 2. **Both sides have to exist before they can be joined**, and *how* that is
 *    reported now depends on where the id came from — see
 *    {@link ProjectMemberService.create}. Each side is asked through the service
 *    that owns it, which is the hand-off Features 010 and 011 each wrote into
 *    their module.
 * 3. **A membership has a period, not a date.** `leftAt` is only meaningful
 *    relative to `joinedAt`, so the check cannot live in a DTO — a `PATCH` that
 *    moves one end has to be judged against the end already stored.
 *    {@link resolveMembershipPeriod} reconstructs both, then
 *    {@link assertOrderedMembershipPeriod} judges them.
 *
 * **Every method here is scoped to one side**, because every endpoint is:
 * Feature 015 removed the unscoped collection, so a payload never repeats the
 * project or the person the caller just named. The two listings are mirrors,
 * and everything under a project returns {@link ProjectMemberRosterEntry} —
 * the membership and the employee, never the project the URL already gave.
 *
 * Only these queries reach the related tables directly, through the selects in
 * `project-member.entity.ts`, because composing a joined read out of separate
 * service calls would be one round trip per row per relation.
 */
@Injectable()
export class ProjectMemberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectService,
    private readonly employees: EmployeeService,
  ) {}

  /**
   * One project and the people on it.
   *
   * The project is fetched once and published beside the list instead of being
   * repeated on every member — which is what the URL naming it makes possible.
   *
   * It is read first and through `ProjectService`, which owns the table, so an
   * unknown id is a `404` naming the project rather than an empty page. Reading
   * it first also means an existing project with nobody on it returns itself
   * with an empty roster, instead of being indistinguishable from one that is
   * not there.
   *
   * The rows and the total are read in a single `$transaction` so both see the
   * same snapshot: run separately, a concurrent insert between them would
   * produce a `total` that does not describe the page just returned.
   */
  async findRoster(
    projectId: string,
    query: ProjectMemberQueryDto,
  ): Promise<ProjectRosterEntity> {
    const project = await this.projects.findOne(projectId);
    const where = { ...buildWhere(query), projectId };

    const [members, total] = await this.prisma.$transaction([
      this.prisma.projectMember.findMany({
        where,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        select: PROJECT_MEMBER_ROSTER_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.projectMember.count({ where }),
    ]);

    const { items, meta } = buildPaginatedResult(
      members.map(toProjectMemberRosterEntry),
      total,
      query,
    );

    return { project, members: items, meta };
  }

  /**
   * One employee and the projects they are on — the mirror of
   * {@link findRoster}, written the same way for the same reason.
   *
   * The employee is published once and each entry carries only the project, so
   * asking "what is Maria working on" does not answer with N copies of Maria.
   *
   * The employee is read first and through `EmployeeService`, which owns the
   * table, so an unknown id is a `404` naming the employee rather than an empty
   * page — and an employee on no projects returns themselves with an empty
   * list, instead of being indistinguishable from one who does not exist.
   */
  async findAssignments(
    employeeId: string,
    query: ProjectMemberQueryDto,
  ): Promise<EmployeeProjectsEntity> {
    const employee = await this.employees.findOne(employeeId);
    const where = { ...buildWhere(query), employeeId };

    const [assignments, total] = await this.prisma.$transaction([
      this.prisma.projectMember.findMany({
        where,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        select: PROJECT_MEMBER_ASSIGNMENT_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.projectMember.count({ where }),
    ]);

    const { items, meta } = buildPaginatedResult(
      assignments.map(toProjectMemberAssignmentEntry),
      total,
      query,
    );

    return { employee, projects: items, meta };
  }

  async findOne(
    projectId: string,
    employeeId: string,
  ): Promise<ProjectMemberRosterEntry> {
    return toProjectMemberRosterEntry(
      await this.findOrThrow(projectId, employeeId),
    );
  }

  /**
   * Assigns an employee to a project.
   *
   * The checks escalate, cheapest and most local first: a body that contradicts
   * itself is a `400` and never reaches the database, then the two sides are
   * confirmed, and only a request sound in both respects can go on to conflict
   * with a membership that already exists.
   *
   * **The two sides fail differently, and that is deliberate.** `projectId`
   * comes from the path, so an unknown one is a `404` — the collection being
   * posted to does not exist. `employeeId` comes from the body, so an unknown
   * one is a `400` naming the field — the collection is fine, the payload
   * points at somebody who is not there. Before Feature 015 both arrived in the
   * body and both were a `400`; moving the project into the URL is what makes
   * the `404` the honest answer.
   *
   * `joinedAt` is resolved here rather than left to the column's
   * `@default(now())`, and that is not redundancy. The default would apply
   * *after* validation, so `POST { leftAt: "2020-01-01" }` with no `joinedAt`
   * would pass a check against nothing and then store a period that ends
   * years before it starts. Resolving first means the value compared is the
   * value stored.
   */
  async create(
    projectId: string,
    dto: CreateProjectMemberDto,
  ): Promise<ProjectMemberRosterEntry> {
    const period = resolveMembershipPeriod(dto, {
      joinedAt: new Date(),
      leftAt: null,
    });

    assertOrderedMembershipPeriod(period);
    await this.assertProjectExists(projectId);
    await this.assertEmployeeExists(dto.employeeId);
    await this.assertNotAlreadyAssigned(projectId, dto.employeeId);

    const created = await this.prisma.projectMember.create({
      data: {
        projectId,
        employeeId: dto.employeeId,
        isProjectManager: dto.isProjectManager,
        ...period,
      },
      select: PROJECT_MEMBER_ROSTER_SELECT,
    });

    return toProjectMemberRosterEntry(created);
  }

  /**
   * Applies a partial update to one membership.
   *
   * The stored row is loaded first, so patching a pair that is not a membership
   * reports that rather than a complaint about the body — and it is what the
   * period check needs: a body carrying only `leftAt` is judged against the
   * `joinedAt` already stored, and a body carrying only `joinedAt` is judged
   * against the `leftAt` already stored, which is what catches a "correction"
   * that would push the start past an end nobody re-sent.
   *
   * Neither id is touched. They are the primary key and they came from the URL;
   * `UpdateProjectMemberDto` does not accept them.
   */
  async update(
    projectId: string,
    employeeId: string,
    dto: UpdateProjectMemberDto,
  ): Promise<ProjectMemberRosterEntry> {
    const current = await this.findOrThrow(projectId, employeeId);
    const period = resolveMembershipPeriod(dto, current);

    assertOrderedMembershipPeriod(period);

    const updated = await this.prisma.projectMember.update({
      where: membershipKey(projectId, employeeId),
      // `undefined` is omitted from the UPDATE by Prisma, so an absent field is
      // left alone while an explicit `null` clears `leftAt`. The two dates are
      // resolved values, so they are written only when the body mentioned them
      // — otherwise the row would be rewritten with what it already holds.
      data: {
        isProjectManager: dto.isProjectManager,
        joinedAt: dto.joinedAt === undefined ? undefined : period.joinedAt,
        leftAt: dto.leftAt === undefined ? undefined : period.leftAt,
      },
      select: PROJECT_MEMBER_ROSTER_SELECT,
    });

    return toProjectMemberRosterEntry(updated);
  }

  /**
   * Deletes a membership outright.
   *
   * No `409` guard, unlike the two modules on either side of this one — nothing
   * references a membership yet. That changes with time entries, which will
   * hang off this pair; the feature that adds them has to decide whether hours
   * block the delete, and this method is where that check belongs.
   *
   * Deleting is the *only* destructive operation here, and it is not how a
   * membership normally ends: setting `leftAt` does that while keeping the
   * record that the person was there. A `DELETE` says the row should never have
   * existed.
   */
  async remove(projectId: string, employeeId: string): Promise<void> {
    await this.assertExists(projectId, employeeId);

    await this.prisma.projectMember.delete({
      where: membershipKey(projectId, employeeId),
    });
  }

  /** Loads a membership by its pair, or reports it missing. */
  private async findOrThrow(
    projectId: string,
    employeeId: string,
  ): Promise<ProjectMemberRosterRow> {
    const member = await this.prisma.projectMember.findUnique({
      where: membershipKey(projectId, employeeId),
      select: PROJECT_MEMBER_ROSTER_SELECT,
    });

    if (member === null) {
      throw new NotFoundException(notFoundMessage(projectId, employeeId));
    }

    return member;
  }

  /**
   * Reports a missing membership.
   *
   * Selects one key column rather than the full record with its four joins: the
   * caller only needs to know the row is there, and what follows is a delete
   * that reads nothing back.
   */
  private async assertExists(
    projectId: string,
    employeeId: string,
  ): Promise<void> {
    const member = await this.prisma.projectMember.findUnique({
      where: membershipKey(projectId, employeeId),
      select: { projectId: true },
    });

    if (member === null) {
      throw new NotFoundException(notFoundMessage(projectId, employeeId));
    }
  }

  /**
   * Reports a `POST` to the members of a project that does not exist.
   *
   * A `404`, because the project came from the path: it is the collection being
   * posted to, and it is not there. The two checks are separate methods rather
   * than one because they now produce different statuses — see
   * {@link ProjectMemberService.create}.
   *
   * Asked through `ProjectService`, which owns the table, rather than by
   * querying `projects` here — the hand-off that module documented when it
   * exported its service.
   */
  private async assertProjectExists(projectId: string): Promise<void> {
    if (!(await this.projects.exists(projectId))) {
      throw new NotFoundException(`Project ${projectId} was not found`);
    }
  }

  /**
   * Rejects a body naming an employee who does not exist.
   *
   * A `400` rather than a `404`: the collection being posted to is fine, it is
   * the payload that points at somebody who is not there. The message is an
   * array — the same shape the `ValidationPipe` produces — so a form marks the
   * offending input with the code it already has for field errors.
   *
   * The database would refuse this too, but as a foreign-key violation
   * surfacing as a `500`; asking first is what turns it into a message naming
   * the field.
   */
  private async assertEmployeeExists(employeeId: string): Promise<void> {
    if (!(await this.employees.exists(employeeId))) {
      throw new BadRequestException([`Employee ${employeeId} does not exist`]);
    }
  }

  /**
   * Rejects a pair that is already a membership.
   *
   * `@@id([projectId, employeeId])` is what actually guarantees this — the
   * database cannot hold two rows for one pair, and that index closes the race
   * between this read and the write that follows. What the read adds is the
   * answer: a `409` naming both sides, instead of a unique-constraint violation
   * surfacing as a `500`.
   *
   * The rule is stricter than "not on this project twice at the same time": a
   * *past* membership blocks a new row just as an active one does, because the
   * key does not include a date. Somebody rejoining a project they had left is
   * expressed by clearing `leftAt` on the existing membership, not by inserting
   * a second one — which is also what keeps the history in one place.
   */
  private async assertNotAlreadyAssigned(
    projectId: string,
    employeeId: string,
  ): Promise<void> {
    const existing = await this.prisma.projectMember.findUnique({
      where: membershipKey(projectId, employeeId),
      select: { projectId: true },
    });

    if (existing !== null) {
      throw new ConflictException(
        `Employee ${employeeId} is already a member of project ${projectId}`,
      );
    }
  }
}

/**
 * The composite primary key, in the shape Prisma generated for it.
 *
 * Written once because `projectId_employeeId` is a name Prisma derives from the
 * `@@id`, not one anybody would guess, and because getting the two ids the
 * wrong way round in one of the five places this is needed would produce a
 * lookup that silently matches nothing.
 */
function membershipKey(
  projectId: string,
  employeeId: string,
): Prisma.ProjectMemberWhereUniqueInput {
  return { projectId_employeeId: { projectId, employeeId } };
}

/** Message used for every 404 path, so they cannot drift apart. */
function notFoundMessage(projectId: string, employeeId: string): string {
  return `Employee ${employeeId} is not a member of project ${projectId}`;
}

/** The dates a write carries: absent means "unchanged", `null` clears `leftAt`. */
interface MembershipPeriodPatch {
  readonly joinedAt?: string;
  readonly leftAt?: string | null;
}

/**
 * Works out the period a write would leave behind.
 *
 * Each end is taken from the body when the body mentions it, and from the row
 * otherwise — which is the whole reason the rule cannot live in a DTO. Three
 * cases have to come out right, and only this function sees all three:
 *
 * - `PATCH { leftAt }` — compared against the stored `joinedAt`, not against
 *   nothing.
 * - `PATCH { joinedAt }` — compared against the stored `leftAt`, which is what
 *   catches a correction that would push the start past an end nobody re-sent.
 * - `POST` — `current` is `{ now, null }`, so an omitted `joinedAt` becomes the
 *   value that will actually be stored rather than a blank the column fills in
 *   after validation has finished.
 *
 * The ISO strings the DTO validated are parsed here, once, on their way to the
 * `timestamp` columns.
 */
function resolveMembershipPeriod(
  { joinedAt, leftAt }: MembershipPeriodPatch,
  current: MembershipPeriod,
): MembershipPeriod {
  return {
    joinedAt: joinedAt === undefined ? current.joinedAt : new Date(joinedAt),
    leftAt: resolveLeftAt(leftAt, current.leftAt),
  };
}

function resolveLeftAt(
  patched: string | null | undefined,
  current: Date | null,
): Date | null {
  if (patched === undefined) {
    return current;
  }

  return patched === null ? null : new Date(patched);
}

/**
 * Rejects a membership that ends before it starts.
 *
 * A `null` `leftAt` is not a violation but an open membership — the normal
 * state of somebody currently on a project — so the rule only applies once both
 * ends are known. The comparison is `<`, so joining and leaving on the same day
 * is allowed: a one-day assignment is real, and `leftAt === joinedAt` is not
 * "before".
 *
 * A `400` rather than a `409`: nothing in the database conflicts with this
 * request, the submitted period simply contradicts itself. The message is an
 * array, the same shape the `ValidationPipe` produces, so a form handles it with
 * the code it already has for field errors.
 */
function assertOrderedMembershipPeriod({
  joinedAt,
  leftAt,
}: MembershipPeriod): void {
  if (leftAt === null) {
    return;
  }

  if (leftAt.getTime() < joinedAt.getTime()) {
    throw new BadRequestException(['leftAt must not be before joinedAt']);
  }
}

/**
 * Builds the `WHERE` shared by all three listings.
 *
 * The two scoped endpoints add their own side on top of this — `{ ...buildWhere(query),
 * projectId }` — so the filters mean the same thing wherever they are supplied,
 * and only the scope differs. That scope comes from the path rather than from a
 * parameter, which is what Feature 015 changed: an id in the URL cannot be
 * omitted, cannot contradict the endpoint, and gets a `404` rather than an empty
 * page when it matches nothing.
 *
 * Returns `undefined` — not an empty object — when nothing was requested,
 * because `undefined` is what `findMany` and `count` both read as "no filter",
 * and the two must agree or the total would not describe the page. Spreading
 * `undefined` is a no-op, so the scoped callers compose with it safely.
 *
 * `activeOnly` is the filter that is not a plain equality: an active membership
 * is one that has not ended, which is `leftAt IS NULL`. It is also the only one
 * checked against `true` rather than `undefined` — `?activeOnly=false` is not a
 * request for the ended memberships, it is the unfiltered listing, and that is
 * what the parameter's name says.
 */
function buildWhere({
  isProjectManager,
  activeOnly,
}: ProjectMemberQueryDto): Prisma.ProjectMemberWhereInput | undefined {
  const filters: Prisma.ProjectMemberWhereInput[] = [];

  if (isProjectManager !== undefined) {
    filters.push({ isProjectManager });
  }

  if (activeOnly === true) {
    filters.push({ leftAt: null });
  }

  return filters.length === 0 ? undefined : { AND: filters };
}

/**
 * Orders by the requested column, then by the primary key.
 *
 * The tie-break is what makes pagination safe, and here it needs both ids:
 * neither sortable column is unique — a project's whole founding team shares a
 * `joinedAt`, and every active membership shares a `leftAt` of `null` — so
 * without it a record could repeat on one page and vanish from the next. The
 * pair is the only total order the table has.
 *
 * `leftAt` states its null placement instead of inheriting PostgreSQL's, which
 * is `NULLS LAST` ascending and `NULLS FIRST` descending. An open membership has
 * no end date; it is neither the earliest nor the latest, so it sits at the end
 * in both directions rather than jumping between the two ends of the listing
 * when a caller flips `?sortOrder=`.
 */
function buildOrderBy(
  sortBy: ProjectMemberSortField,
  sortOrder: SortOrder,
): Prisma.ProjectMemberOrderByWithRelationInput[] {
  return [
    sortBy === 'leftAt'
      ? { leftAt: { sort: sortOrder, nulls: 'last' } }
      : { joinedAt: sortOrder },
    { projectId: SortOrder.ASC },
    { employeeId: SortOrder.ASC },
  ];
}
