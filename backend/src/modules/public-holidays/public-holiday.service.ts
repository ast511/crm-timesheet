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
import { HolidayType } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePublicHolidayDto } from './dto/create-public-holiday.dto';
import { PublicHolidayQueryDto } from './dto/public-holiday-query.dto';
import { UpdatePublicHolidayDto } from './dto/update-public-holiday.dto';
import {
  occurrenceSpanIn,
  OccurrenceSourceRow,
  OccurrenceSpan,
  PUBLIC_HOLIDAY_OCCURRENCE_SELECT,
  PublicHolidayOccurrenceEntity,
  toPublicHolidayOccurrence,
} from './entities/public-holiday-occurrence.entity';
import {
  PUBLIC_HOLIDAY_PUBLIC_SELECT,
  PublicHolidayEntity,
  PublicHolidayRow,
  toPublicHolidayEntity,
} from './entities/public-holiday.entity';
import { PublicHolidaySortField } from './public-holiday.constants';

/**
 * Makes PostgreSQL fold the case of both operands, so `easter` finds `Easter`.
 * Extracted because getting it wrong on one of the comparisons below would
 * produce a search or a duplicate check that quietly behaves differently from
 * the others.
 */
const CASE_INSENSITIVE = { mode: 'insensitive' } as const;

/**
 * Everything a holiday's rules are judged against, with both dates already
 * parsed and recurrence already derived.
 *
 * It exists because on `PATCH` none of these values can be read off the body
 * alone: a request that moves only `endDate` is judged against the `startDate`
 * already stored, and one that changes `type` changes which duplicate rule
 * applies. Assembling the *resulting* holiday first, then judging that, is what
 * lets `create` and `update` share one set of rules instead of two spellings of
 * them.
 */
interface HolidayFacts {
  readonly name: string;
  readonly type: HolidayType;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly isRecurring: boolean;
  readonly validFromYear: number | null;
  readonly validToYear: number | null;
}

/**
 * The years a version covers, with the open ends made explicit.
 *
 * `null` means "open", and open ends are what most rows have — so every
 * comparison would otherwise need its own null check, and one of them would
 * eventually get it wrong. Resolving to infinities once makes the overlap test
 * a pair of ordinary comparisons.
 */
interface YearRange {
  readonly from: number;
  readonly to: number;
}

/**
 * Every rule about public holidays lives here; the controller only routes.
 *
 * Four of them are worth naming, because they are what makes this more than a
 * seventh copy of the same CRUD shape:
 *
 * 1. **`type` decides what the dates mean.** A `FIXED` holiday recurs on its
 *    month and day and the stored year is disregarded; a `VARIABLE` one is that
 *    year's occurrence and next year is a different row. Nothing else in this
 *    service is readable without that distinction.
 * 2. **Recurrence is derived, not asked for.** `isRecurring` follows from
 *    `type` — see {@link recurrenceFor}. A body may state it, and a body that
 *    states it wrongly is a `400`; it is never quietly overwritten.
 * 3. **There are two duplicate rules, one per type.** Month-and-day for
 *    `FIXED`, name-and-start-date for `VARIABLE`. See
 *    {@link PublicHolidayService.assertNoDuplicate}.
 * 4. **A row is a version, and history is never rewritten.** `DELETE` exists
 *    and is a hard delete, for a row entered by mistake. A holiday a government
 *    repealed is `PATCH { validToYear: 2026 }` instead: the version stays and
 *    keeps answering for 2026 and every year before it. A holiday that comes
 *    back, or moves to another day, is a `POST` of a new version rather than a
 *    patch of the old one — patching the dates would change what the earlier
 *    years looked like. This service enforces the range; which endpoint records
 *    which kind of change is a rule for the caller, and the reason the two
 *    duplicate rules had to learn about overlapping years.
 *
 * Nothing here computes a date **from a rule**. Easter is entered, not
 * calculated: the rule differs by confession and by calendar, and a wrong
 * answer would be indistinguishable from a right one until somebody worked on
 * the wrong day. What the calendar methods do compute is the opposite kind of
 * thing — a stored month and day re-anchored onto a year the caller named,
 * which is arithmetic on a fact that is already in the table.
 */
@Injectable()
export class PublicHolidayService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of holidays, narrowed by `search` and the four filters, ordered by
   * `sortBy`.
   *
   * The rows and the total are read in a single `$transaction` so both see the
   * same snapshot: run separately, a concurrent insert between them would
   * produce a `total` that does not describe the page just returned.
   */
  async findAll(
    query: PublicHolidayQueryDto,
  ): Promise<PaginatedResult<PublicHolidayEntity>> {
    const where = buildWhere(query);

    const [holidays, total] = await this.prisma.$transaction([
      this.prisma.publicHoliday.findMany({
        where,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        select: PUBLIC_HOLIDAY_PUBLIC_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.publicHoliday.count({ where }),
    ]);

    return buildPaginatedResult(
      holidays.map(toPublicHolidayEntity),
      total,
      query,
    );
  }

  async findOne(id: string): Promise<PublicHolidayEntity> {
    return toPublicHolidayEntity(await this.findOrThrow(id));
  }

  /**
   * Every day the company is closed in one year, in date order.
   *
   * This is the question the stored rows cannot answer directly, and the reason
   * the endpoint exists: a fixed holiday's row carries whatever year it was
   * first entered with, so `GET /public-holidays` would report Christmas as
   * `2025-12-25` however many times it is asked about 2027. Here it comes back
   * as `2027-12-25`, because the month and day are the fact and the year is the
   * caller's.
   *
   * Not paginated, and it takes no `sortBy` — deliberately, on both counts. A
   * year holds on the order of fifteen holidays, so a page envelope would be
   * ceremony a client unwraps for nothing, and a calendar has exactly one
   * useful order. Giving it options would be a second way to ask a question
   * that already has one answer.
   *
   * **The answer is historically correct.** Asking for 2026 returns the
   * holidays as 2026 had them — the versions whose validity range covered that
   * year, on the dates those versions carried — no matter how many times a
   * holiday has since been repealed, reinstated or moved. That is what Feature
   * 019 replaced the `isActive` flag to achieve: a flag carried no date, so
   * switching a holiday off in 2029 also erased it from 2026, a year the office
   * really was closed.
   *
   * The one thing it cannot reconstruct is a *correction*: patching a version's
   * dates rewrites every year that version covers, which is right for fixing a
   * typo and wrong for recording that the holiday moved. Recording a move is a
   * new version — see `UpdatePublicHolidayDto`.
   */
  async findYear(year: number): Promise<PublicHolidayOccurrenceEntity[]> {
    const occurrences = await this.findOccurrences(year);

    return occurrences.map(({ holiday, span }) =>
      toPublicHolidayOccurrence(holiday, span),
    );
  }

  /**
   * The same calendar, narrowed to one month.
   *
   * A holiday is included when its span **overlaps** the month, not merely when
   * it starts inside it: a holiday running from 31 December to 1 January closes
   * a day in each, and a December view that omitted it would be wrong about a
   * day the office is shut.
   *
   * `month` arrives one-based and is converted here, once — the single place
   * this module knows that `Date` counts months from zero.
   */
  async findMonth(
    year: number,
    month: number,
  ): Promise<PublicHolidayOccurrenceEntity[]> {
    const occurrences = await this.findOccurrences(year);

    const monthStart = Date.UTC(year, month - 1, 1);
    const nextMonthStart = Date.UTC(year, month, 1);

    return occurrences
      .filter(
        ({ span }) =>
          span.startDate.getTime() < nextMonthStart &&
          span.endDate.getTime() >= monthStart,
      )
      .map(({ holiday, span }) => toPublicHolidayOccurrence(holiday, span));
  }

  /**
   * The active holidays that fall in a year, each with the span it occupies,
   * in date order.
   *
   * `yearFilter` does the whole in-force decision in SQL: a fixed version whose
   * validity range does not cover the year, and a variable holiday belonging to
   * another year, never leave the database. What is left for TypeScript is only
   * *which day* a fixed holiday lands on, which {@link occurrenceSpanIn}
   * decides. The set is a national calendar, tens of rows.
   *
   * The sort is `startDate` then `name`: a total order, so two holidays landing
   * on the same day come out the same way on every request rather than in
   * whatever order the rows happened to arrive.
   */
  private async findOccurrences(
    year: number,
  ): Promise<{ holiday: OccurrenceSourceRow; span: OccurrenceSpan }[]> {
    const holidays = await this.prisma.publicHoliday.findMany({
      where: yearFilter(year),
      select: PUBLIC_HOLIDAY_OCCURRENCE_SELECT,
    });

    return holidays
      .flatMap((holiday) => {
        const span = occurrenceSpanIn(holiday, year);

        return span === null ? [] : [{ holiday, span }];
      })
      .sort(
        (left, right) =>
          left.span.startDate.getTime() - right.span.startDate.getTime() ||
          left.holiday.name.localeCompare(right.holiday.name),
      );
  }

  /**
   * Creates a holiday, once its span makes sense and nothing already occupies
   * it.
   *
   * The two local checks come first, so a body that contradicts itself is a
   * `400` and never reaches the database; only a coherent body goes on to
   * conflict with a holiday that already exists.
   */
  async create(dto: CreatePublicHolidayDto): Promise<PublicHolidayEntity> {
    const facts: HolidayFacts = {
      name: dto.name,
      type: dto.type,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      isRecurring: recurrenceFor(dto.type),
      validFromYear: dto.validFromYear ?? null,
      validToYear: dto.validToYear ?? null,
    };

    assertOrderedSpan(facts);
    assertStatedRecurrenceAgrees(dto.isRecurring, facts);
    assertValidityBelongsToType(facts);
    assertOrderedValidity(facts);
    await this.assertNoDuplicate(facts);

    const created = await this.prisma.publicHoliday.create({
      data: {
        name: facts.name,
        description: dto.description,
        type: facts.type,
        isNational: dto.isNational,
        startDate: facts.startDate,
        endDate: facts.endDate,
        isRecurring: facts.isRecurring,
        validFromYear: facts.validFromYear,
        validToYear: facts.validToYear,
      },
      select: PUBLIC_HOLIDAY_PUBLIC_SELECT,
    });

    return toPublicHolidayEntity(created);
  }

  /**
   * Applies a partial update, re-checking every rule against the result.
   *
   * Existence is checked first, so patching a missing id reports the missing id
   * rather than a complaint about the body — and the row it loads is what the
   * rules need. `PATCH { endDate }` is judged against the stored `startDate`,
   * `PATCH { type: "FIXED" }` re-derives recurrence and is checked against the
   * fixed calendar rather than against the rule the row used to obey.
   *
   * This is also where "a fixed holiday stays editable" is realised, by there
   * being nothing here that treats one differently: no field is frozen, and the
   * validity range is written like any other column.
   */
  async update(
    id: string,
    dto: UpdatePublicHolidayDto,
  ): Promise<PublicHolidayEntity> {
    const current = await this.findOrThrow(id);
    const facts = mergeFacts(dto, current);

    assertOrderedSpan(facts);
    assertStatedRecurrenceAgrees(dto.isRecurring, facts);
    assertValidityBelongsToType(facts);
    assertOrderedValidity(facts);
    await this.assertNoDuplicate(facts, id);

    const updated = await this.prisma.publicHoliday.update({
      where: { id },
      // `undefined` is omitted from the UPDATE by Prisma, so an absent field is
      // left alone while an explicit `null` clears the nullable `description`.
      // `isRecurring` is the exception and is always written: it is derived
      // from the resolved `type`, so a body that changed the type has to move
      // it too, and writing the value it already holds costs nothing.
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type,
        isNational: dto.isNational,
        startDate: dto.startDate === undefined ? undefined : facts.startDate,
        endDate: dto.endDate === undefined ? undefined : facts.endDate,
        isRecurring: facts.isRecurring,
        // Always written, like `isRecurring` and for a related reason: changing
        // the type clears them, so the value is the resolved one rather than
        // whatever the body did or did not carry.
        validFromYear: facts.validFromYear,
        validToYear: facts.validToYear,
      },
      select: PUBLIC_HOLIDAY_PUBLIC_SELECT,
    });

    return toPublicHolidayEntity(updated);
  }

  /**
   * Hard-deletes a holiday.
   *
   * Nothing refers to a holiday yet — the table has no relations — so there is
   * no history to protect and no count to guard the delete with, unlike
   * `ProjectService.remove`. Existence is checked first so an unknown id is a
   * `404` naming it rather than Prisma's `P2025` surfacing as a `500`.
   *
   * This endpoint is for a row entered by mistake. A holiday that was real and
   * has been repealed is `PATCH { validToYear: <last year> }`: deleting it
   * would take away the reason a day in a past year was not worked, which is
   * precisely what the validity range exists to preserve.
   */
  async remove(id: string): Promise<void> {
    const holiday = await this.prisma.publicHoliday.findUnique({
      where: { id },
      select: { id: true },
    });

    if (holiday === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    await this.prisma.publicHoliday.delete({ where: { id } });
  }

  /** Loads a holiday by id or reports it missing. */
  private async findOrThrow(id: string): Promise<PublicHolidayRow> {
    const holiday = await this.prisma.publicHoliday.findUnique({
      where: { id },
      select: PUBLIC_HOLIDAY_PUBLIC_SELECT,
    });

    if (holiday === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    return holiday;
  }

  /**
   * Applies whichever duplicate rule the holiday's type calls for.
   *
   * The two rules are different because the two types identify a holiday
   * differently, and using one rule for both would be wrong in both directions:
   * month-and-day applied to `VARIABLE` holidays would reject Easter 2027 for
   * colliding with Easter 2026, while name-and-date applied to `FIXED` ones
   * would let "New Year" and "New Year's Day" both claim 1 January.
   *
   * `excludeId` is the holiday being updated, which must not conflict with
   * itself.
   */
  private async assertNoDuplicate(
    facts: HolidayFacts,
    excludeId?: string,
  ): Promise<void> {
    if (facts.type === HolidayType.FIXED) {
      await this.assertFixedDayIsFree(facts, excludeId);
      return;
    }

    await this.assertOccurrenceIsFree(facts, excludeId);
  }

  /**
   * Rejects a second fixed holiday on the same month and day **in years the two
   * versions share**.
   *
   * The year inside `startDate` is still disregarded — that is what "fixed"
   * means, and treating `2025-01-01` and `2026-01-01` as two holidays would let
   * the calendar be duplicated once per year. What is *not* disregarded is the
   * validity range, and that is what Feature 019 changed: Children's Day valid
   * through 2026 and Children's Day valid from 2029 are both 1 June and are not
   * a conflict, because no year has both. They are two versions of a holiday
   * that went away and came back, which is exactly the history this module
   * exists to keep.
   *
   * The comparison happens in TypeScript over every fixed row, rather than in
   * the `WHERE`, and that is deliberate. Matching a month and a day needs
   * `EXTRACT(...)`, which Prisma cannot express and which CLAUDE.md admits only
   * as raw SQL on request. The set being read is a country's legal calendar —
   * tens of rows — so the query is cheaper than the index it would take to
   * avoid it. Should this ever hold a decade of every region's holidays, a
   * generated `month_day` column is the change to make, and it would leave this
   * method's signature untouched.
   */
  private async assertFixedDayIsFree(
    { startDate, validFromYear, validToYear }: HolidayFacts,
    excludeId?: string,
  ): Promise<void> {
    const fixedHolidays = await this.prisma.publicHoliday.findMany({
      where: {
        type: HolidayType.FIXED,
        ...(excludeId === undefined ? {} : { NOT: { id: excludeId } }),
      },
      select: { startDate: true, validFromYear: true, validToYear: true },
    });

    const range = toYearRange(validFromYear, validToYear);

    const conflict = fixedHolidays.find(
      (holiday) =>
        fallsOnSameDayOfYear(holiday.startDate, startDate) &&
        rangesOverlap(
          range,
          toYearRange(holiday.validFromYear, holiday.validToYear),
        ),
    );

    if (conflict !== undefined) {
      throw new ConflictException(
        `A fixed public holiday already falls on ${toMonthDay(startDate)} in ${describeOverlap(conflict)}. Fixed holidays are identified by month and day; the year inside the date is disregarded, but the validity range is not.`,
      );
    }
  }

  /**
   * Rejects a variable holiday already recorded for that name and that start.
   *
   * Name *and* start date, never name alone: "Easter" is expected to appear
   * once per year, and a check on the name would make the second year's entry
   * impossible — which is the whole reason `VARIABLE` exists.
   *
   * The name is compared case-insensitively, for the reason every other
   * duplicate check in this project is: `easter` and `Easter` are one holiday to
   * a human. The date is compared exactly — these are the UTC instants the
   * column holds, both written by the same `new Date(isoString)` path.
   */
  private async assertOccurrenceIsFree(
    { name, startDate }: HolidayFacts,
    excludeId?: string,
  ): Promise<void> {
    const conflict = await this.prisma.publicHoliday.findFirst({
      where: {
        type: HolidayType.VARIABLE,
        name: { equals: name, ...CASE_INSENSITIVE },
        startDate,
        ...(excludeId === undefined ? {} : { NOT: { id: excludeId } }),
      },
      select: { id: true },
    });

    if (conflict !== null) {
      throw new ConflictException(
        `A variable public holiday named "${name}" already starts on ${toIsoDate(startDate)}`,
      );
    }
  }
}

/** Message used for every 404 path, so they cannot drift apart. */
function notFoundMessage(id: string): string {
  return `Public holiday ${id} was not found`;
}

/**
 * Whether a holiday of this type repeats every year.
 *
 * The single definition of the rule, which is what keeps `isRecurring` from
 * becoming a second, contradictable statement of `type`. `FIXED` recurs by
 * month and day; `VARIABLE` does not recur at all — its next occurrence is a
 * new row with new dates, which is the only way a date that moves can be
 * recorded without this module calculating it.
 */
function recurrenceFor(type: HolidayType): boolean {
  return type === HolidayType.FIXED;
}

/**
 * Works out the holiday a `PATCH` would leave behind.
 *
 * Each field is taken from the body when the body mentions it, and from the row
 * otherwise — which is the whole reason the rules cannot live in a DTO. The
 * cases that have to come out right, and that only this function sees:
 *
 * - `PATCH { endDate }` — compared against the stored `startDate`.
 * - `PATCH { type }` — recurrence is re-derived, and the *other* duplicate rule
 *   now applies.
 * - `PATCH { name }` on a variable holiday — re-checked against the stored
 *   start date, so a rename cannot collide with that year's other entry.
 *
 * The ISO strings the DTO validated are parsed here, once, on their way to the
 * `timestamp` columns.
 */
function mergeFacts(
  dto: UpdatePublicHolidayDto,
  current: PublicHolidayRow,
): HolidayFacts {
  const type = dto.type ?? current.type;

  // Reclassifying a holiday as VARIABLE clears the range rather than carrying
  // it over: a variable row is one year by construction, so a range inherited
  // from its fixed past would be a statement the new type cannot make — and
  // `assertValidityBelongsToType` would then reject a patch that changed only
  // the type, which is not the client's mistake.
  const carriedFrom =
    type === HolidayType.VARIABLE ? null : current.validFromYear;
  const carriedTo = type === HolidayType.VARIABLE ? null : current.validToYear;

  return {
    name: dto.name ?? current.name,
    type,
    startDate:
      dto.startDate === undefined ? current.startDate : new Date(dto.startDate),
    endDate:
      dto.endDate === undefined ? current.endDate : new Date(dto.endDate),
    isRecurring: recurrenceFor(type),
    validFromYear:
      dto.validFromYear === undefined ? carriedFrom : dto.validFromYear,
    validToYear: dto.validToYear === undefined ? carriedTo : dto.validToYear,
  };
}

/**
 * Rejects a holiday that ends before it starts.
 *
 * The comparison is `<`, so a one-day holiday — the common case, where both
 * ends are the same date — is allowed: `endDate === startDate` is not "before".
 *
 * A `400` rather than a `409`: nothing in the database conflicts with this
 * request, the submitted span simply contradicts itself. The message is an
 * array, the same shape the `ValidationPipe` produces, so a form handles it
 * with the code it already has for field errors.
 */
function assertOrderedSpan({ startDate, endDate }: HolidayFacts): void {
  if (endDate.getTime() < startDate.getTime()) {
    throw new BadRequestException(['endDate must not be before startDate']);
  }
}

/**
 * Rejects a validity range on a holiday that cannot have one.
 *
 * A `VARIABLE` row already *is* one year — the year in `startDate` — so a range
 * on it would be a second statement of the same fact, free to disagree with the
 * first. The same shape of rule as the recurrence check, and there for the same
 * reason: a field that means nothing for this type is a `400` rather than
 * something silently stored and later believed.
 */
function assertValidityBelongsToType({
  type,
  validFromYear,
  validToYear,
}: HolidayFacts): void {
  if (type !== HolidayType.VARIABLE) {
    return;
  }

  if (validFromYear !== null || validToYear !== null) {
    throw new BadRequestException([
      'validFromYear and validToYear apply to FIXED holidays only; a VARIABLE holiday is already one year',
    ]);
  }
}

/**
 * Rejects a range that ends before it begins.
 *
 * Only when both ends are stated: an open end is not a violation but an
 * unknown. The comparison is `<`, so a version valid for exactly one year —
 * `from` and `to` the same — is allowed, which is what a holiday granted once
 * and dropped again looks like.
 */
function assertOrderedValidity({
  validFromYear,
  validToYear,
}: HolidayFacts): void {
  if (validFromYear === null || validToYear === null) {
    return;
  }

  if (validToYear < validFromYear) {
    throw new BadRequestException([
      'validToYear must not be before validFromYear',
    ]);
  }
}

/**
 * Resolves the open ends of a range so overlap is a pair of comparisons.
 *
 * `null` means "open", and most rows have at least one open end — so every
 * comparison would otherwise carry its own null check, and one of them would
 * eventually get it wrong.
 */
function toYearRange(
  validFromYear: number | null,
  validToYear: number | null,
): YearRange {
  return {
    from: validFromYear ?? Number.NEGATIVE_INFINITY,
    to: validToYear ?? Number.POSITIVE_INFINITY,
  };
}

/** Whether two validity ranges have any year in common. */
function rangesOverlap(left: YearRange, right: YearRange): boolean {
  return left.from <= right.to && right.from <= left.to;
}

/**
 * Rejects an `isRecurring` that contradicts the holiday's type.
 *
 * The value is derived either way, so this check exists purely so a client that
 * bothered to state it is told it was wrong instead of watching its value
 * disappear. A body that omits the field says nothing and is accepted.
 *
 * It is what makes "if type == FIXED then isRecurring must be true" a rule the
 * API enforces rather than a convention it silently repairs.
 */
function assertStatedRecurrenceAgrees(
  stated: boolean | undefined,
  { type, isRecurring }: HolidayFacts,
): void {
  if (stated === undefined || stated === isRecurring) {
    return;
  }

  throw new BadRequestException([
    `isRecurring must be ${String(isRecurring)} for a ${type} holiday`,
  ]);
}

/**
 * Builds the `WHERE` for the list endpoint.
 *
 * The parameters are independent and combine with `AND`: `?isActive=true`
 * narrows whatever `?search=` matched rather than replacing it. Returns
 * `undefined` — not an empty object — when nothing was requested, because
 * `undefined` is what `findMany` and `count` both read as "no filter", and the
 * two must agree or the total would not describe the page.
 */
function buildWhere({
  search,
  type,
  isNational,
}: PublicHolidayQueryDto): Prisma.PublicHolidayWhereInput | undefined {
  const filters: Prisma.PublicHolidayWhereInput[] = [];

  if (search !== undefined && search.length > 0) {
    filters.push({ name: { contains: search, ...CASE_INSENSITIVE } });
  }

  if (type !== undefined) {
    filters.push({ type });
  }

  if (isNational !== undefined) {
    filters.push({ isNational });
  }

  return filters.length === 0 ? undefined : { AND: filters };
}

/**
 * Narrows a read to the versions that were in force in one year.
 *
 * This is where the calendar stopped being "today's holidays, dated to your
 * year" and became "the holidays as that year had them". The two types are
 * narrowed on different columns, because they record the same fact differently:
 *
 * - **`FIXED`** — by the validity range. A version whose range does not cover
 *   the year is not returned at all, which is what makes a repeal stop applying
 *   *from* a year rather than retroactively. An open end matches everything on
 *   that side, so the ordinary row — no range at all — is in force in every
 *   year, exactly as it was before this column existed.
 * - **`VARIABLE`** — by the start date falling inside the year, since such a
 *   row already *is* one year. That half of the table grows by a few rows every
 *   year forever, so narrowing it in SQL is worth doing.
 *
 * The date bounds are `[1 January, 1 January next)` in UTC — a half-open range,
 * so the last instant of 31 December is included without the query naming it.
 *
 * A variable holiday belongs to the year its `startDate` falls in. One that
 * spans New Year's Eve therefore counts under the year it began, and does not
 * appear twice; splitting it across both years would report two holidays where
 * there is one.
 */
function yearFilter(year: number): Prisma.PublicHolidayWhereInput {
  return {
    OR: [
      {
        type: HolidayType.FIXED,
        AND: [
          { OR: [{ validFromYear: null }, { validFromYear: { lte: year } }] },
          { OR: [{ validToYear: null }, { validToYear: { gte: year } }] },
        ],
      },
      {
        type: HolidayType.VARIABLE,
        startDate: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
      },
    ],
  };
}

/**
 * Orders by the requested column, then by `id`.
 *
 * The tie-break is what makes pagination safe: none of the three sortable
 * columns is unique — two holidays can share a name across years, and a
 * multi-day holiday's neighbours can share its start date — so without it a
 * record could repeat on one page and vanish from the next.
 */
function buildOrderBy(
  sortBy: PublicHolidaySortField,
  sortOrder: SortOrder,
): Prisma.PublicHolidayOrderByWithRelationInput[] {
  return [{ [sortBy]: sortOrder }, { id: SortOrder.ASC }];
}

/**
 * Whether two dates are the same month and day, in UTC.
 *
 * UTC on both sides, and that is the load-bearing part: the columns are
 * `timestamp` and a client posting `2026-01-01` gets UTC midnight, so reading
 * the local month and day would make the answer depend on the server's
 * timezone — 1 January would become 31 December for anyone west of Greenwich,
 * and the duplicate check would pass or fail by deployment.
 */
function fallsOnSameDayOfYear(left: Date, right: Date): boolean {
  return (
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}

/**
 * Puts the conflicting version's years into the `409`, so the message says
 * which one was hit rather than only that something was.
 *
 * Without it a client rejected for 1 June cannot tell whether the clash is with
 * the version that ended in 2026 or the one that starts in 2029 — and the whole
 * point of the range is that those are different rows.
 */
function describeOverlap({
  validFromYear,
  validToYear,
}: {
  validFromYear: number | null;
  validToYear: number | null;
}): string {
  if (validFromYear === null && validToYear === null) {
    return 'every year';
  }

  if (validFromYear === null) {
    return `every year up to ${String(validToYear)}`;
  }

  if (validToYear === null) {
    return `${String(validFromYear)} onwards`;
  }

  return validFromYear === validToYear
    ? String(validFromYear)
    : `${String(validFromYear)}–${String(validToYear)}`;
}

/** `12-25` — the part of a fixed holiday's date that carries meaning. */
function toMonthDay(date: Date): string {
  return toIsoDate(date).slice(5);
}

/** `2026-04-12` — the UTC calendar date, without the time nobody entered. */
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
