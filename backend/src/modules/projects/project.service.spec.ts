import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SortOrder } from '../../common/enums/sort-order.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { PublicProjectRow } from './entities/project.entity';
import { ProjectService } from './project.service';

/** A row as PostgreSQL returns it — `Date` objects, not strings. */
const PROJECT: PublicProjectRow = {
  id: 'prj-1',
  code: 'CRM-TS',
  name: 'CRM TimeSheet',
  clientName: 'Internal',
  description: 'Internal time tracking platform.',
  estimatedHours: 2400,
  color: '#2563EB',
  projectStatus: 'ACTIVE',
  projectPriority: 'HIGH',
  isArchived: false,
  startDate: new Date('2026-01-12T00:00:00.000Z'),
  endDate: null,
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  updatedAt: new Date('2026-08-02T11:30:00.000Z'),
};

/** The same row once mapped for the API. */
const PROJECT_ENTITY = {
  id: 'prj-1',
  code: 'CRM-TS',
  name: 'CRM TimeSheet',
  clientName: 'Internal',
  description: 'Internal time tracking platform.',
  estimatedHours: 2400,
  color: '#2563EB',
  projectStatus: 'ACTIVE',
  projectPriority: 'HIGH',
  isArchived: false,
  startDate: '2026-01-12T00:00:00.000Z',
  endDate: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T11:30:00.000Z',
};

/** The smallest body `create` accepts, for tests about something else. */
const CREATE_BODY: CreateProjectDto = {
  code: 'CRM-TS',
  name: 'CRM TimeSheet',
  clientName: 'Internal',
  estimatedHours: 2400,
};

const defaultQuery = (
  overrides: Partial<ProjectQueryDto> = {},
): ProjectQueryDto =>
  Object.assign(new ProjectQueryDto(), overrides) as ProjectQueryDto;

describe('ProjectService', () => {
  let service: ProjectService;
  let prisma: {
    project: {
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
      project: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
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
      providers: [ProjectService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ProjectService);
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.project.findMany.mockResolvedValue([PROJECT]);
      prisma.project.count.mockResolvedValue(1);
    });

    it('returns the mapped page with its metadata', async () => {
      const result = await service.findAll(defaultQuery());

      expect(result).toEqual({
        items: [PROJECT_ENTITY],
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

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('orders by the requested column and breaks ties on id', async () => {
      await service.findAll(
        defaultQuery({ sortBy: 'estimatedHours', sortOrder: SortOrder.DESC }),
      );

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ estimatedHours: 'desc' }, { id: 'asc' }],
        }),
      );
    });

    it('searches code, name and clientName case-insensitively', async () => {
      await service.findAll(defaultQuery({ search: 'crm' }));

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: [
                  { code: { contains: 'crm', mode: 'insensitive' } },
                  { name: { contains: 'crm', mode: 'insensitive' } },
                  { clientName: { contains: 'crm', mode: 'insensitive' } },
                ],
              },
            ],
          },
        }),
      );
    });

    it('combines the search with the filters rather than replacing it', async () => {
      await service.findAll(
        defaultQuery({
          search: 'crm',
          isArchived: false,
          projectStatus: 'ACTIVE',
        }),
      );

      const [{ where }] = prisma.project.findMany.mock.calls[0] as [
        { where: { AND: unknown[] } },
      ];

      expect(where.AND).toHaveLength(3);
      expect(where.AND).toEqual(
        expect.arrayContaining([
          { isArchived: false },
          { projectStatus: 'ACTIVE' },
        ]),
      );
    });

    it('filters by lifecycle state and priority', async () => {
      await service.findAll(
        defaultQuery({ projectStatus: 'ON_HOLD', projectPriority: 'LOW' }),
      );

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [{ projectStatus: 'ON_HOLD' }, { projectPriority: 'LOW' }],
          },
        }),
      );
    });

    it('applies no filter when nothing was asked for', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });

    it('counts with the same filter the page was read with', async () => {
      await service.findAll(defaultQuery({ search: 'crm', isArchived: true }));

      const [{ where: listedWith }] = prisma.project.findMany.mock.calls[0] as [
        { where: unknown },
      ];
      const [{ where: countedWith }] = prisma.project.count.mock.calls[0] as [
        { where: unknown },
      ];

      expect(countedWith).toEqual(listedWith);
    });

    it('reads the rows and the total under one transaction', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('reads only the published columns', async () => {
      await service.findAll(defaultQuery());

      const [{ select }] = prisma.project.findMany.mock.calls[0] as [
        { select: Record<string, unknown> },
      ];

      expect(select).toBeDefined();
      expect(select).not.toHaveProperty('memberships');
    });
  });

  describe('findOne', () => {
    it('returns the mapped project', async () => {
      prisma.project.findUnique.mockResolvedValue(PROJECT);

      await expect(service.findOne('prj-1')).resolves.toEqual(PROJECT_ENTITY);
    });

    it('throws 404 for an unknown id', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.project.findFirst.mockResolvedValue(null);
      prisma.project.create.mockResolvedValue(PROJECT);
    });

    it('creates and returns the project when nothing collides', async () => {
      await expect(service.create(CREATE_BODY)).resolves.toEqual(
        PROJECT_ENTITY,
      );
    });

    it('checks the code case-insensitively', async () => {
      await service.create(CREATE_BODY);

      expect(prisma.project.findFirst).toHaveBeenCalledWith({
        where: { code: { equals: 'CRM-TS', mode: 'insensitive' } },
        select: { id: true },
      });
    });

    it('rejects a duplicate code', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'prj-9' });

      await expect(service.create(CREATE_BODY)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.project.create).not.toHaveBeenCalled();
    });

    it('parses the ISO dates into the Date objects the columns hold', async () => {
      await service.create({
        ...CREATE_BODY,
        startDate: '2026-01-12',
        endDate: '2026-12-31',
      });

      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            startDate: new Date('2026-01-12'),
            endDate: new Date('2026-12-31'),
          }) as unknown,
        }),
      );
    });

    it('stores no dates when the body carries none', async () => {
      await service.create(CREATE_BODY);

      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            startDate: null,
            endDate: null,
          }) as unknown,
        }),
      );
    });

    it('rejects an endDate before the startDate, before touching the database', async () => {
      await expect(
        service.create({
          ...CREATE_BODY,
          startDate: '2026-06-30',
          endDate: '2026-01-12',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.project.findFirst).not.toHaveBeenCalled();
      expect(prisma.project.create).not.toHaveBeenCalled();
    });

    it('accepts a project that starts and finishes on the same day', async () => {
      await expect(
        service.create({
          ...CREATE_BODY,
          startDate: '2026-06-30',
          endDate: '2026-06-30',
        }),
      ).resolves.toBeDefined();
    });

    it('accepts an endDate with no startDate, since an open start cannot be violated', async () => {
      await expect(
        service.create({ ...CREATE_BODY, endDate: '2026-01-12' }),
      ).resolves.toBeDefined();
    });

    it('leaves the defaulted columns to the schema when the body omits them', async () => {
      await service.create(CREATE_BODY);

      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isArchived: undefined,
            projectStatus: undefined,
            projectPriority: undefined,
          }) as unknown,
        }),
      );
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.project.findUnique.mockResolvedValue(PROJECT);
      prisma.project.findFirst.mockResolvedValue(null);
      prisma.project.update.mockResolvedValue(PROJECT);
    });

    it('reports a missing project before looking at the body', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing', { code: 'CRM-TS' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.project.findFirst).not.toHaveBeenCalled();
    });

    it('does not treat the project as a conflict with itself', async () => {
      await service.update('prj-1', { code: 'CRM-TS' });

      expect(prisma.project.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ NOT: { id: 'prj-1' } }) as unknown,
        }),
      );
    });

    it('skips the uniqueness query when the code is not touched', async () => {
      await service.update('prj-1', { name: 'CRM TimeSheet v2' });

      expect(prisma.project.findFirst).not.toHaveBeenCalled();
    });

    it('rejects a code already held by another project', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'prj-9' });

      await expect(
        service.update('prj-1', { code: 'PORTAL' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('leaves omitted fields undefined so Prisma keeps them', async () => {
      await service.update('prj-1', { name: 'CRM TimeSheet v2' });

      expect(prisma.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prj-1' },
          data: {
            code: undefined,
            name: 'CRM TimeSheet v2',
            clientName: undefined,
            description: undefined,
            estimatedHours: undefined,
            color: undefined,
            projectStatus: undefined,
            projectPriority: undefined,
            isArchived: undefined,
            startDate: undefined,
            endDate: undefined,
          },
        }),
      );
    });

    /**
     * The three cases the rule exists for. Each one is a schedule spread over
     * the body and the stored row, which is why the check cannot live in a DTO.
     */
    describe('the date range', () => {
      it('judges a patched endDate against the stored startDate', async () => {
        // The row starts 2026-01-12; an end before that contradicts it.
        await expect(
          service.update('prj-1', { endDate: '2025-12-01' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.project.update).not.toHaveBeenCalled();
      });

      it('accepts a patched endDate after the stored startDate', async () => {
        await service.update('prj-1', { endDate: '2026-12-01' });

        expect(prisma.project.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              startDate: undefined,
              endDate: new Date('2026-12-01'),
            }) as unknown,
          }),
        );
      });

      it('lifts the constraint when the startDate is cleared in the same body', async () => {
        await expect(
          service.update('prj-1', { startDate: null, endDate: '2025-12-01' }),
        ).resolves.toBeDefined();
        expect(prisma.project.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              startDate: null,
              endDate: new Date('2025-12-01'),
            }) as unknown,
          }),
        );
      });

      it('judges a patched startDate against the stored endDate', async () => {
        prisma.project.findUnique.mockResolvedValue({
          ...PROJECT,
          endDate: new Date('2026-06-30T00:00:00.000Z'),
        });

        await expect(
          service.update('prj-1', { startDate: '2026-12-01' }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });
    });

    /** The rule the feature states: archiving does not freeze a project. */
    it('edits an archived project like any other', async () => {
      prisma.project.findUnique.mockResolvedValue({
        ...PROJECT,
        isArchived: true,
      });

      await expect(
        service.update('prj-1', { name: 'Renamed while archived' }),
      ).resolves.toBeDefined();
    });

    it('moves a project back out of archived', async () => {
      prisma.project.findUnique.mockResolvedValue({
        ...PROJECT,
        isArchived: true,
      });

      await service.update('prj-1', { isArchived: false });

      expect(prisma.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isArchived: false }) as unknown,
        }),
      );
    });
  });

  describe('remove', () => {
    it('deletes a project nobody is a member of', async () => {
      prisma.project.findUnique.mockResolvedValue({
        _count: { memberships: 0, timesheetEntries: 0 },
      });

      await expect(service.remove('prj-1')).resolves.toBeUndefined();
      expect(prisma.project.delete).toHaveBeenCalledWith({
        where: { id: 'prj-1' },
      });
    });

    it('throws 404 for an unknown id', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.project.delete).not.toHaveBeenCalled();
    });

    it('throws 409 while project members still reference it', async () => {
      prisma.project.findUnique.mockResolvedValue({
        _count: { memberships: 3, timesheetEntries: 0 },
      });

      await expect(service.remove('prj-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.project.delete).not.toHaveBeenCalled();
    });

    /**
     * Added by Feature 030 — the "feature that adds time entries" this method was
     * written in anticipation of. An entry on an approved timesheet is part of a
     * month the company signed off, so removing the project underneath it would
     * silently drop the hours behind an invoice.
     */
    it('throws 409 while timesheet entries still reference it', async () => {
      prisma.project.findUnique.mockResolvedValue({
        _count: { memberships: 0, timesheetEntries: 12 },
      });

      await expect(service.remove('prj-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.project.delete).not.toHaveBeenCalled();
    });

    it('decides both answers from one read', async () => {
      prisma.project.findUnique.mockResolvedValue({
        _count: { memberships: 0, timesheetEntries: 0 },
      });

      await service.remove('prj-1');

      expect(prisma.project.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * The batch hand-off Feature 030's fill-in engine needs: a month may name a
   * dozen projects across thirty days, and one `exists` per line would be sixty
   * round trips to answer three questions.
   */
  describe('findExistingIds', () => {
    it('answers with the ids that were found, in one query', async () => {
      prisma.project.findMany.mockResolvedValue([
        { id: 'prj-1' },
        { id: 'prj-3' },
      ]);

      await expect(
        service.findExistingIds(['prj-1', 'prj-2', 'prj-3']),
      ).resolves.toEqual(['prj-1', 'prj-3']);

      expect(prisma.project.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['prj-1', 'prj-2', 'prj-3'] } },
        select: { id: true },
      });
    });

    /**
     * "Does this project exist" and "is it still being worked on" are different
     * questions. A month filled in late may legitimately book hours to a project
     * archived since, so folding the second in would treat that as a typo.
     */
    it('does not filter out archived projects', async () => {
      prisma.project.findMany.mockResolvedValue([{ id: 'prj-1' }]);

      await service.findExistingIds(['prj-1']);

      const { where } = prisma.project.findMany.mock.calls.at(-1)?.[0] as {
        where: Record<string, unknown>;
      };

      expect(where).not.toHaveProperty('isArchived');
    });
  });

  /** The hand-off to the future project-members module: a yes or a no. */
  describe('exists', () => {
    it('reports a project that is there', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'prj-1' });

      await expect(service.exists('prj-1')).resolves.toBe(true);
    });

    it('reports one that is not', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(service.exists('missing')).resolves.toBe(false);
    });

    it('reads the id alone rather than the whole record', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'prj-1' });

      await service.exists('prj-1');

      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'prj-1' },
        select: { id: true },
      });
    });
  });
});
