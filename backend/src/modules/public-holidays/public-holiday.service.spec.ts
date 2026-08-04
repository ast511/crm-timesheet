import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SortOrder } from '../../common/enums/sort-order.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePublicHolidayDto } from './dto/create-public-holiday.dto';
import { PublicHolidayQueryDto } from './dto/public-holiday-query.dto';
import { PublicHolidayRow } from './entities/public-holiday.entity';
import { PublicHolidayService } from './public-holiday.service';

/** A fixed holiday as PostgreSQL returns it — `Date` objects, not strings. */
const CHRISTMAS: PublicHolidayRow = {
  id: 'hol-1',
  name: 'Christmas Day',
  description: 'First and second day of Christmas.',
  type: 'FIXED',
  isNational: true,
  validFromYear: null,
  validToYear: null,
  startDate: new Date('2025-12-25T00:00:00.000Z'),
  endDate: new Date('2025-12-26T00:00:00.000Z'),
  isRecurring: true,
  createdAt: new Date('2026-08-04T10:00:00.000Z'),
  updatedAt: new Date('2026-08-04T11:30:00.000Z'),
};

/** The same row once mapped for the API. */
const CHRISTMAS_ENTITY = {
  id: 'hol-1',
  name: 'Christmas Day',
  description: 'First and second day of Christmas.',
  type: 'FIXED',
  isNational: true,
  validFromYear: null,
  validToYear: null,
  startDate: '2025-12-25T00:00:00.000Z',
  endDate: '2025-12-26T00:00:00.000Z',
  isRecurring: true,
  createdAt: '2026-08-04T10:00:00.000Z',
  updatedAt: '2026-08-04T11:30:00.000Z',
};

/** A variable holiday, for the rules the two types answer differently. */
const EASTER: PublicHolidayRow = {
  ...CHRISTMAS,
  id: 'hol-2',
  name: 'Easter',
  type: 'VARIABLE',
  isRecurring: false,
  startDate: new Date('2026-04-12T00:00:00.000Z'),
  endDate: new Date('2026-04-13T00:00:00.000Z'),
};

/** The smallest body `create` accepts, for tests about something else. */
const FIXED_BODY: CreatePublicHolidayDto = {
  name: 'Christmas Day',
  type: 'FIXED',
  startDate: '2025-12-25',
  endDate: '2025-12-26',
};

const VARIABLE_BODY: CreatePublicHolidayDto = {
  name: 'Easter',
  type: 'VARIABLE',
  startDate: '2026-04-12',
  endDate: '2026-04-13',
};

const defaultQuery = (
  overrides: Partial<PublicHolidayQueryDto> = {},
): PublicHolidayQueryDto =>
  Object.assign(
    new PublicHolidayQueryDto(),
    overrides,
  ) as PublicHolidayQueryDto;

describe('PublicHolidayService', () => {
  let service: PublicHolidayService;
  let prisma: {
    publicHoliday: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      publicHoliday: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      // The real client resolves the batch; the mock only has to await the
      // promises the mocked delegates already returned.
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PublicHolidayService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(PublicHolidayService);
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.publicHoliday.findMany.mockResolvedValue([CHRISTMAS]);
      prisma.publicHoliday.count.mockResolvedValue(1);
    });

    it('returns the mapped page with its metadata', async () => {
      const result = await service.findAll(defaultQuery());

      expect(result).toEqual({
        items: [CHRISTMAS_ENTITY],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      });
    });

    it('translates the page request into skip and take', async () => {
      await service.findAll(defaultQuery({ page: 3, limit: 10 }));

      expect(prisma.publicHoliday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('orders by the requested column and breaks ties on id', async () => {
      await service.findAll(
        defaultQuery({ sortBy: 'startDate', sortOrder: SortOrder.DESC }),
      );

      expect(prisma.publicHoliday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
        }),
      );
    });

    it('searches the name case-insensitively', async () => {
      await service.findAll(defaultQuery({ search: 'christ' }));

      expect(prisma.publicHoliday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [{ name: { contains: 'christ', mode: 'insensitive' } }],
          },
        }),
      );
    });

    it('combines the search with the filters rather than replacing it', async () => {
      await service.findAll(
        defaultQuery({ search: 'day', type: 'FIXED', isNational: true }),
      );

      const [{ where }] = prisma.publicHoliday.findMany.mock.calls[0] as [
        { where: { AND: unknown[] } },
      ];

      expect(where.AND).toHaveLength(3);
      expect(where.AND).toEqual(
        expect.arrayContaining([{ type: 'FIXED' }, { isNational: true }]),
      );
    });

    it('filters by nationality', async () => {
      await service.findAll(defaultQuery({ isNational: false }));

      expect(prisma.publicHoliday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [{ isNational: false }] } }),
      );
    });

    it('applies no filter when nothing was asked for', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.publicHoliday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });

    it('counts with the same filter the page was read with', async () => {
      await service.findAll(
        defaultQuery({ search: 'easter', isNational: false }),
      );

      const [{ where: listedWith }] = prisma.publicHoliday.findMany.mock
        .calls[0] as [{ where: unknown }];
      const [{ where: countedWith }] = prisma.publicHoliday.count.mock
        .calls[0] as [{ where: unknown }];

      expect(countedWith).toEqual(listedWith);
    });

    it('reads the rows and the total under one transaction', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('returns the mapped holiday', async () => {
      prisma.publicHoliday.findUnique.mockResolvedValue(CHRISTMAS);

      await expect(service.findOne('hol-1')).resolves.toEqual(CHRISTMAS_ENTITY);
    });

    it('throws 404 for an unknown id', async () => {
      prisma.publicHoliday.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  /**
   * The calendar endpoints, and the one thing they do that the list cannot: a
   * fixed holiday's stored year is replaced by the year that was asked for.
   */
  describe('the calendar', () => {
    /** Stored in 2025, and still 25 December in every year after it. */
    const CHRISTMAS_ROW = {
      id: 'hol-1',
      name: 'Christmas Day',
      description: null,
      type: 'FIXED',
      isNational: true,
      startDate: new Date('2025-12-25T00:00:00.000Z'),
      endDate: new Date('2025-12-26T00:00:00.000Z'),
    };

    /** Stored in a *later* year than Christmas, to make the sort do real work. */
    const NEW_YEAR_ROW = {
      ...CHRISTMAS_ROW,
      id: 'hol-2',
      name: 'New Year',
      startDate: new Date('2030-01-01T00:00:00.000Z'),
      endDate: new Date('2030-01-02T00:00:00.000Z'),
    };

    const EASTER_ROW = {
      ...CHRISTMAS_ROW,
      id: 'hol-3',
      name: 'Easter',
      type: 'VARIABLE',
      startDate: new Date('2027-05-02T00:00:00.000Z'),
      endDate: new Date('2027-05-03T00:00:00.000Z'),
    };

    describe('findYear', () => {
      it('re-anchors a fixed holiday onto the year that was asked for', async () => {
        prisma.publicHoliday.findMany.mockResolvedValue([CHRISTMAS_ROW]);

        await expect(service.findYear(2027)).resolves.toEqual([
          {
            id: 'hol-1',
            name: 'Christmas Day',
            description: null,
            type: 'FIXED',
            isNational: true,
            startDate: '2027-12-25T00:00:00.000Z',
            endDate: '2027-12-26T00:00:00.000Z',
          },
        ]);
      });

      it('leaves a variable holiday on the dates it was entered with', async () => {
        prisma.publicHoliday.findMany.mockResolvedValue([EASTER_ROW]);

        const [easter] = await service.findYear(2027);

        expect(easter.startDate).toBe('2027-05-02T00:00:00.000Z');
        expect(easter.endDate).toBe('2027-05-03T00:00:00.000Z');
      });

      it('drops a variable holiday belonging to another year', async () => {
        prisma.publicHoliday.findMany.mockResolvedValue([
          { ...EASTER_ROW, startDate: new Date('2026-04-12T00:00:00.000Z') },
        ]);

        await expect(service.findYear(2027)).resolves.toEqual([]);
      });

      /** The projected order, not the stored one — the point of the endpoint. */
      it('orders by the projected date, not by the year in the rows', async () => {
        prisma.publicHoliday.findMany.mockResolvedValue([
          CHRISTMAS_ROW,
          NEW_YEAR_ROW,
        ]);

        const calendar = await service.findYear(2027);

        expect(calendar.map((occurrence) => occurrence.startDate)).toEqual([
          '2027-01-01T00:00:00.000Z',
          '2027-12-25T00:00:00.000Z',
        ]);
      });

      it('carries a span that crosses New Year into the following year', async () => {
        prisma.publicHoliday.findMany.mockResolvedValue([
          {
            ...CHRISTMAS_ROW,
            name: 'Year End',
            startDate: new Date('2025-12-31T00:00:00.000Z'),
            endDate: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]);

        const [yearEnd] = await service.findYear(2027);

        expect(yearEnd.startDate).toBe('2027-12-31T00:00:00.000Z');
        expect(yearEnd.endDate).toBe('2028-01-01T00:00:00.000Z');
      });

      /** A day that does not exist that year is not a day the company is closed. */
      it('omits a 29 February holiday in a common year', async () => {
        prisma.publicHoliday.findMany.mockResolvedValue([
          {
            ...CHRISTMAS_ROW,
            startDate: new Date('2024-02-29T00:00:00.000Z'),
            endDate: new Date('2024-02-29T00:00:00.000Z'),
          },
        ]);

        await expect(service.findYear(2027)).resolves.toEqual([]);
      });

      it('keeps it in a leap year', async () => {
        prisma.publicHoliday.findMany.mockResolvedValue([
          {
            ...CHRISTMAS_ROW,
            startDate: new Date('2024-02-29T00:00:00.000Z'),
            endDate: new Date('2024-02-29T00:00:00.000Z'),
          },
        ]);

        const [leapDay] = await service.findYear(2028);

        expect(leapDay.startDate).toBe('2028-02-29T00:00:00.000Z');
      });

      it('decides in SQL which versions were in force that year', async () => {
        prisma.publicHoliday.findMany.mockResolvedValue([]);

        await service.findYear(2027);

        expect(prisma.publicHoliday.findMany).toHaveBeenCalledWith({
          where: {
            OR: [
              {
                type: 'FIXED',
                AND: [
                  {
                    OR: [
                      { validFromYear: null },
                      { validFromYear: { lte: 2027 } },
                    ],
                  },
                  {
                    OR: [{ validToYear: null }, { validToYear: { gte: 2027 } }],
                  },
                ],
              },
              {
                type: 'VARIABLE',
                startDate: {
                  gte: new Date('2027-01-01T00:00:00.000Z'),
                  lt: new Date('2028-01-01T00:00:00.000Z'),
                },
              },
            ],
          },
          select: expect.any(Object) as unknown,
        });
      });

      /** Nothing the caller already knows comes back in the payload. */
      it('publishes neither the validity range, isRecurring nor the year asked for', async () => {
        prisma.publicHoliday.findMany.mockResolvedValue([CHRISTMAS_ROW]);

        const [occurrence] = await service.findYear(2027);

        expect(occurrence).not.toHaveProperty('validFromYear');
        expect(occurrence).not.toHaveProperty('validToYear');
        expect(occurrence).not.toHaveProperty('isRecurring');
        expect(occurrence).not.toHaveProperty('year');
      });

      /**
       * The scenario the whole feature exists for: a holiday repealed, brought
       * back on a different day, and a past year still reported as it was.
       *
       * Both versions are in the table; the SQL filter is what picks the right
       * one, so this asserts the projection over the rows that filter would
       * have returned for each year.
       */
      describe("Children's Day, repealed and reinstated", () => {
        const THROUGH_2026 = {
          ...CHRISTMAS_ROW,
          id: 'hol-old',
          name: "Children's Day",
          startDate: new Date('2020-06-01T00:00:00.000Z'),
          endDate: new Date('2020-06-01T00:00:00.000Z'),
        };

        const FROM_2029 = {
          ...THROUGH_2026,
          id: 'hol-new',
          startDate: new Date('2029-06-05T00:00:00.000Z'),
          endDate: new Date('2029-06-05T00:00:00.000Z'),
        };

        it('reports 2026 with the version and the day that applied then', async () => {
          prisma.publicHoliday.findMany.mockResolvedValue([THROUGH_2026]);

          const [occurrence] = await service.findYear(2026);

          expect(occurrence.id).toBe('hol-old');
          expect(occurrence.startDate).toBe('2026-06-01T00:00:00.000Z');
        });

        it('reports nothing for the years in between', async () => {
          prisma.publicHoliday.findMany.mockResolvedValue([]);

          await expect(service.findYear(2027)).resolves.toEqual([]);
        });

        it('reports 2030 with the new version, on its new day', async () => {
          prisma.publicHoliday.findMany.mockResolvedValue([FROM_2029]);

          const [occurrence] = await service.findYear(2030);

          expect(occurrence.id).toBe('hol-new');
          expect(occurrence.startDate).toBe('2030-06-05T00:00:00.000Z');
        });
      });

      it('is not paginated', async () => {
        prisma.publicHoliday.findMany.mockResolvedValue([CHRISTMAS_ROW]);

        await expect(service.findYear(2027)).resolves.toBeInstanceOf(Array);
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });
    });

    describe('findMonth', () => {
      beforeEach(() => {
        prisma.publicHoliday.findMany.mockResolvedValue([
          CHRISTMAS_ROW,
          NEW_YEAR_ROW,
          EASTER_ROW,
        ]);
      });

      /** One-based, as a person writes a date: 5 is May. */
      it('reads the month as one-based', async () => {
        const may = await service.findMonth(2027, 5);

        expect(may.map((occurrence) => occurrence.name)).toEqual(['Easter']);
      });

      it('keeps a fixed holiday projected into that month', async () => {
        const december = await service.findMonth(2027, 12);

        expect(december.map((occurrence) => occurrence.name)).toEqual([
          'Christmas Day',
        ]);
      });

      it('returns nothing for a month with no holidays', async () => {
        await expect(service.findMonth(2027, 7)).resolves.toEqual([]);
      });

      /** Overlap, not "starts in": a span crossing the boundary closes days in both. */
      it('includes a holiday that only overlaps the month', async () => {
        prisma.publicHoliday.findMany.mockResolvedValue([
          {
            ...CHRISTMAS_ROW,
            name: 'Year End',
            startDate: new Date('2025-12-31T00:00:00.000Z'),
            endDate: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]);

        const december = await service.findMonth(2027, 12);

        expect(december.map((occurrence) => occurrence.name)).toEqual([
          'Year End',
        ]);
      });

      it('excludes a holiday ending the day before the month starts', async () => {
        prisma.publicHoliday.findMany.mockResolvedValue([CHRISTMAS_ROW]);

        await expect(service.findMonth(2027, 11)).resolves.toEqual([]);
      });
    });
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.publicHoliday.create.mockResolvedValue(CHRISTMAS);
    });

    it('creates and returns the holiday when nothing collides', async () => {
      await expect(service.create(FIXED_BODY)).resolves.toEqual(
        CHRISTMAS_ENTITY,
      );
    });

    it('parses the ISO dates into the Date objects the columns hold', async () => {
      await service.create(FIXED_BODY);

      expect(prisma.publicHoliday.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            startDate: new Date('2025-12-25'),
            endDate: new Date('2025-12-26'),
          }) as unknown,
        }),
      );
    });

    it('leaves the defaulted columns to the schema when the body omits them', async () => {
      await service.create(FIXED_BODY);

      expect(prisma.publicHoliday.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isNational: undefined,
          }) as unknown,
        }),
      );
    });

    it('rejects an endDate before the startDate, before touching the database', async () => {
      await expect(
        service.create({
          ...FIXED_BODY,
          startDate: '2025-12-26',
          endDate: '2025-12-25',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.publicHoliday.create).not.toHaveBeenCalled();
    });

    it('accepts a one-day holiday, where both ends are the same date', async () => {
      await expect(
        service.create({
          ...FIXED_BODY,
          startDate: '2025-12-25',
          endDate: '2025-12-25',
        }),
      ).resolves.toBeDefined();
    });

    /** `isRecurring` follows from `type`; it is never asked for, only checked. */
    describe('recurrence', () => {
      it('derives true for a fixed holiday', async () => {
        await service.create(FIXED_BODY);

        expect(prisma.publicHoliday.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ isRecurring: true }) as unknown,
          }),
        );
      });

      it('derives false for a variable one', async () => {
        await service.create(VARIABLE_BODY);

        expect(prisma.publicHoliday.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ isRecurring: false }) as unknown,
          }),
        );
      });

      it('accepts a body that states the derived value', async () => {
        await expect(
          service.create({ ...FIXED_BODY, isRecurring: true }),
        ).resolves.toBeDefined();
      });

      it('rejects a fixed holiday declared non-recurring', async () => {
        await expect(
          service.create({ ...FIXED_BODY, isRecurring: false }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.publicHoliday.create).not.toHaveBeenCalled();
      });

      it('rejects a variable holiday declared recurring', async () => {
        await expect(
          service.create({ ...VARIABLE_BODY, isRecurring: true }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.publicHoliday.create).not.toHaveBeenCalled();
      });
    });

    /** The range belongs to FIXED holidays; a VARIABLE row already is one year. */
    describe('the validity range', () => {
      it('stores the range a fixed holiday was given', async () => {
        await service.create({
          ...FIXED_BODY,
          validFromYear: 2020,
          validToYear: 2026,
        });

        expect(prisma.publicHoliday.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              validFromYear: 2020,
              validToYear: 2026,
            }) as unknown,
          }),
        );
      });

      it('stores nulls when the body omits it, meaning always in force', async () => {
        await service.create(FIXED_BODY);

        expect(prisma.publicHoliday.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              validFromYear: null,
              validToYear: null,
            }) as unknown,
          }),
        );
      });

      it('accepts a version valid for exactly one year', async () => {
        await expect(
          service.create({
            ...FIXED_BODY,
            validFromYear: 2026,
            validToYear: 2026,
          }),
        ).resolves.toBeDefined();
      });

      it('rejects a range that ends before it begins', async () => {
        await expect(
          service.create({
            ...FIXED_BODY,
            validFromYear: 2026,
            validToYear: 2020,
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.publicHoliday.create).not.toHaveBeenCalled();
      });

      it.each(['validFromYear', 'validToYear'])(
        'rejects %s on a variable holiday',
        async (field) => {
          await expect(
            service.create({ ...VARIABLE_BODY, [field]: 2026 }),
          ).rejects.toBeInstanceOf(BadRequestException);
          expect(prisma.publicHoliday.create).not.toHaveBeenCalled();
        },
      );
    });

    /** Two types, two ways of being a duplicate. */
    describe('duplicate protection', () => {
      it('rejects a fixed holiday on a day already taken, whatever the year', async () => {
        // Stored under 2025; the new one claims 2030 — the same 25 December.
        prisma.publicHoliday.findMany.mockResolvedValue([
          {
            startDate: new Date('2025-12-25T00:00:00.000Z'),
            validFromYear: null,
            validToYear: null,
          },
        ]);

        await expect(
          service.create({
            ...FIXED_BODY,
            startDate: '2030-12-25',
            endDate: '2030-12-26',
          }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.publicHoliday.create).not.toHaveBeenCalled();
      });

      it('accepts a fixed holiday on a free day', async () => {
        prisma.publicHoliday.findMany.mockResolvedValue([
          {
            startDate: new Date('2025-01-01T00:00:00.000Z'),
            validFromYear: null,
            validToYear: null,
          },
        ]);

        await expect(service.create(FIXED_BODY)).resolves.toBeDefined();
      });

      /**
       * The rule Feature 019 added, and the case it exists for: a holiday that
       * was repealed and later came back is two versions on the same day, and
       * they are not a duplicate because no year has both.
       */
      describe('across validity ranges', () => {
        /** Children's Day, 1 June, as it applied through 2026. */
        const REPEALED = {
          startDate: new Date('2020-06-01T00:00:00.000Z'),
          validFromYear: null,
          validToYear: 2026,
        };

        const CHILDRENS_DAY: CreatePublicHolidayDto = {
          name: "Children's Day",
          type: 'FIXED',
          startDate: '2029-06-01',
          endDate: '2029-06-01',
        };

        it('accepts a version starting after the previous one ended', async () => {
          prisma.publicHoliday.findMany.mockResolvedValue([REPEALED]);

          await expect(
            service.create({ ...CHILDRENS_DAY, validFromYear: 2029 }),
          ).resolves.toBeDefined();
          expect(prisma.publicHoliday.create).toHaveBeenCalled();
        });

        it('rejects a version whose years overlap the previous one', async () => {
          prisma.publicHoliday.findMany.mockResolvedValue([REPEALED]);

          await expect(
            service.create({ ...CHILDRENS_DAY, validFromYear: 2026 }),
          ).rejects.toBeInstanceOf(ConflictException);
          expect(prisma.publicHoliday.create).not.toHaveBeenCalled();
        });

        it('rejects an open-ended version against a repealed one', async () => {
          prisma.publicHoliday.findMany.mockResolvedValue([REPEALED]);

          // No `validFromYear`, so it claims every year — including 2026.
          await expect(service.create(CHILDRENS_DAY)).rejects.toBeInstanceOf(
            ConflictException,
          );
        });

        it('names the conflicting version’s years in the message', async () => {
          prisma.publicHoliday.findMany.mockResolvedValue([REPEALED]);

          await expect(service.create(CHILDRENS_DAY)).rejects.toThrow(
            /up to 2026/,
          );
        });

        it('still rejects two always-in-force versions on the same day', async () => {
          prisma.publicHoliday.findMany.mockResolvedValue([
            {
              startDate: new Date('2025-12-25T00:00:00.000Z'),
              validFromYear: null,
              validToYear: null,
            },
          ]);

          await expect(service.create(FIXED_BODY)).rejects.toBeInstanceOf(
            ConflictException,
          );
        });
      });

      it('reads the validity range alongside the day it checks', async () => {
        await service.create(FIXED_BODY);

        expect(prisma.publicHoliday.findMany).toHaveBeenCalledWith({
          where: { type: 'FIXED' },
          select: {
            startDate: true,
            validFromYear: true,
            validToYear: true,
          },
        });
      });

      it('checks a variable holiday by name and start date together', async () => {
        await service.create(VARIABLE_BODY);

        expect(prisma.publicHoliday.findFirst).toHaveBeenCalledWith({
          where: {
            type: 'VARIABLE',
            name: { equals: 'Easter', mode: 'insensitive' },
            startDate: new Date('2026-04-12'),
          },
          select: { id: true },
        });
      });

      it('rejects the same variable holiday twice in one year', async () => {
        prisma.publicHoliday.findFirst.mockResolvedValue({ id: 'hol-9' });

        await expect(service.create(VARIABLE_BODY)).rejects.toBeInstanceOf(
          ConflictException,
        );
        expect(prisma.publicHoliday.create).not.toHaveBeenCalled();
      });

      /** The reason the variable rule is not "the name is taken". */
      it('accepts the same variable holiday in another year', async () => {
        await expect(
          service.create({
            ...VARIABLE_BODY,
            startDate: '2027-03-28',
            endDate: '2027-03-29',
          }),
        ).resolves.toBeDefined();
        expect(prisma.publicHoliday.create).toHaveBeenCalled();
      });

      it('does not apply the fixed calendar rule to a variable holiday', async () => {
        await service.create(VARIABLE_BODY);

        expect(prisma.publicHoliday.findMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.publicHoliday.findUnique.mockResolvedValue(CHRISTMAS);
      prisma.publicHoliday.update.mockResolvedValue(CHRISTMAS);
    });

    it('reports a missing holiday before looking at the body', async () => {
      prisma.publicHoliday.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing', { name: 'Christmas' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.publicHoliday.update).not.toHaveBeenCalled();
    });

    it('leaves omitted fields undefined so Prisma keeps them', async () => {
      await service.update('hol-1', { description: null });

      expect(prisma.publicHoliday.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'hol-1' },
          data: {
            name: undefined,
            description: null,
            type: undefined,
            isNational: undefined,
            startDate: undefined,
            endDate: undefined,
            isRecurring: true,
            // Resolved, not passed through: the row's range is carried forward
            // so a type change could not leave a stale one behind.
            validFromYear: null,
            validToYear: null,
          },
        }),
      );
    });

    it('does not treat the holiday as a conflict with itself', async () => {
      await service.update('hol-1', { startDate: '2025-12-25' });

      expect(prisma.publicHoliday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ NOT: { id: 'hol-1' } }) as unknown,
        }),
      );
    });

    /**
     * The rule this feature exists to state: a fixed holiday is closed off at a
     * year, never deleted and never retroactively hidden.
     */
    describe('a repealed fixed holiday', () => {
      it('is closed off with validToYear rather than removed', async () => {
        await service.update('hol-1', { validToYear: 2026 });

        expect(prisma.publicHoliday.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ validToYear: 2026 }) as unknown,
          }),
        );
        expect(prisma.publicHoliday.delete).not.toHaveBeenCalled();
      });

      it('re-opens the range when the repeal was a mistake', async () => {
        prisma.publicHoliday.findUnique.mockResolvedValue({
          ...CHRISTMAS,
          validToYear: 2026,
        });

        await service.update('hol-1', { validToYear: null });

        expect(prisma.publicHoliday.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ validToYear: null }) as unknown,
          }),
        );
      });

      it('keeps the other end of the range when only one is patched', async () => {
        prisma.publicHoliday.findUnique.mockResolvedValue({
          ...CHRISTMAS,
          validFromYear: 2020,
        });

        await service.update('hol-1', { validToYear: 2026 });

        expect(prisma.publicHoliday.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              validFromYear: 2020,
              validToYear: 2026,
            }) as unknown,
          }),
        );
      });

      it('rejects a range that ends before it begins', async () => {
        prisma.publicHoliday.findUnique.mockResolvedValue({
          ...CHRISTMAS,
          validFromYear: 2020,
        });

        await expect(
          service.update('hol-1', { validToYear: 2019 }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.publicHoliday.update).not.toHaveBeenCalled();
      });

      it('is renamed and re-dated like any other row', async () => {
        await expect(
          service.update('hol-1', {
            name: "Children's Day",
            startDate: '2025-06-01',
            endDate: '2025-06-01',
          }),
        ).resolves.toBeDefined();
      });
    });

    /** Each end may move on its own, so the span is resolved against the row. */
    describe('the date span', () => {
      it('judges a patched endDate against the stored startDate', async () => {
        // The row starts 2025-12-25; an end before that contradicts it.
        await expect(
          service.update('hol-1', { endDate: '2025-12-01' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.publicHoliday.update).not.toHaveBeenCalled();
      });

      it('judges a patched startDate against the stored endDate', async () => {
        await expect(
          service.update('hol-1', { startDate: '2025-12-31' }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('accepts both ends moved together', async () => {
        await service.update('hol-1', {
          startDate: '2025-12-24',
          endDate: '2025-12-26',
        });

        expect(prisma.publicHoliday.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              startDate: new Date('2025-12-24'),
              endDate: new Date('2025-12-26'),
            }) as unknown,
          }),
        );
      });
    });

    /** Changing the type moves both the recurrence and the duplicate rule. */
    describe('changing the type', () => {
      it('re-derives recurrence from the new type', async () => {
        await service.update('hol-1', { type: 'VARIABLE' });

        expect(prisma.publicHoliday.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              type: 'VARIABLE',
              isRecurring: false,
            }) as unknown,
          }),
        );
      });

      it('applies the variable duplicate rule once the type is variable', async () => {
        await service.update('hol-1', { type: 'VARIABLE' });

        expect(prisma.publicHoliday.findFirst).toHaveBeenCalled();
        expect(prisma.publicHoliday.findMany).not.toHaveBeenCalled();
      });

      it('applies the fixed calendar rule once the type is fixed', async () => {
        prisma.publicHoliday.findUnique.mockResolvedValue(EASTER);

        await service.update('hol-2', { type: 'FIXED' });

        expect(prisma.publicHoliday.findMany).toHaveBeenCalled();
        expect(prisma.publicHoliday.findFirst).not.toHaveBeenCalled();
      });

      it('rejects a recurrence flag that contradicts the new type', async () => {
        await expect(
          service.update('hol-1', { type: 'VARIABLE', isRecurring: true }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.publicHoliday.update).not.toHaveBeenCalled();
      });
    });

    it('re-checks a renamed variable holiday against its stored start date', async () => {
      prisma.publicHoliday.findUnique.mockResolvedValue(EASTER);
      prisma.publicHoliday.findFirst.mockResolvedValue({ id: 'hol-9' });

      await expect(
        service.update('hol-2', { name: 'Pentecost' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.publicHoliday.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the holiday', async () => {
      prisma.publicHoliday.findUnique.mockResolvedValue({ id: 'hol-1' });

      await expect(service.remove('hol-1')).resolves.toBeUndefined();
      expect(prisma.publicHoliday.delete).toHaveBeenCalledWith({
        where: { id: 'hol-1' },
      });
    });

    it('throws 404 for an unknown id', async () => {
      prisma.publicHoliday.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.publicHoliday.delete).not.toHaveBeenCalled();
    });

    it('reads the id alone rather than the whole record', async () => {
      prisma.publicHoliday.findUnique.mockResolvedValue({ id: 'hol-1' });

      await service.remove('hol-1');

      expect(prisma.publicHoliday.findUnique).toHaveBeenCalledWith({
        where: { id: 'hol-1' },
        select: { id: true },
      });
    });
  });
});
