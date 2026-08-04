import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SortOrder } from '../../common/enums/sort-order.enum';
import { EmployeeStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeeService } from '../employees/employee.service';
import { ProjectService } from '../projects/project.service';
import { CreateProjectMemberDto } from './dto/create-project-member.dto';
import { ProjectMemberQueryDto } from './dto/project-member-query.dto';
import {
  ProjectMemberAssignmentRow,
  ProjectMemberRosterRow,
} from './entities/project-member.entity';
import { ProjectMemberService } from './project-member.service';

/** The employee side of a row, as PostgreSQL returns it. */
const EMPLOYEE_SUMMARY = {
  id: 'emp-1',
  employeeCode: 'EMP-0002',
  firstName: 'Maria',
  lastName: 'Ionescu',
  seniority: 'SENIOR',
  status: 'ACTIVE',
  department: { id: 'dep-1', code: 'DEV', name: 'Development' },
  position: { id: 'pos-1', code: 'TL', name: 'Team Leader' },
} as const;

/** The project side. */
const PROJECT_SUMMARY = {
  id: 'prj-1',
  code: 'CRM-TS',
  name: 'CRM TimeSheet',
  clientName: 'Internal',
  color: '#2563EB',
} as const;

const PERIOD_ROW = {
  isProjectManager: true,
  joinedAt: new Date('2026-01-12T00:00:00.000Z'),
  leftAt: null,
};

const PERIOD_ENTRY = {
  isProjectManager: true,
  joinedAt: '2026-01-12T00:00:00.000Z',
  leftAt: null,
};

/** A row read for a project's roster — no `project`, the URL supplied it. */
const ROSTER_ROW: ProjectMemberRosterRow = {
  ...PERIOD_ROW,
  employee: { ...EMPLOYEE_SUMMARY },
};

const ROSTER_ENTRY = { employee: { ...EMPLOYEE_SUMMARY }, ...PERIOD_ENTRY };

/** The mirror: a row read for an employee's assignments — no `employee`. */
const ASSIGNMENT_ROW: ProjectMemberAssignmentRow = {
  ...PERIOD_ROW,
  project: { ...PROJECT_SUMMARY },
};

const ASSIGNMENT_ENTRY = { project: { ...PROJECT_SUMMARY }, ...PERIOD_ENTRY };

/** What the two owning services hand back; only identity matters here. */
const PROJECT_ENTITY = { id: 'prj-1', code: 'CRM-TS' };
const EMPLOYEE_ENTITY = { id: 'emp-1', employeeCode: 'EMP-0002' };

/** The smallest body `create` accepts — the project comes from the path. */
const CREATE_BODY: CreateProjectMemberDto = { employeeId: 'emp-1' };

/** The composite key, as Prisma spells it. */
const KEY = {
  projectId_employeeId: { projectId: 'prj-1', employeeId: 'emp-1' },
};

const defaultQuery = (
  overrides: Partial<ProjectMemberQueryDto> = {},
): ProjectMemberQueryDto =>
  Object.assign(
    new ProjectMemberQueryDto(),
    overrides,
  ) as ProjectMemberQueryDto;

describe('ProjectMemberService', () => {
  let service: ProjectMemberService;
  let prisma: {
    projectMember: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let projects: { exists: jest.Mock; findOne: jest.Mock };
  let employees: { findStatus: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    prisma = {
      projectMember: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      // The real client resolves the batch; the mock only has to await the
      // promises the mocked delegates already returned.
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };

    projects = {
      exists: jest.fn().mockResolvedValue(true),
      findOne: jest.fn().mockResolvedValue(PROJECT_ENTITY),
    };
    employees = {
      findStatus: jest.fn().mockResolvedValue(EmployeeStatus.ACTIVE),
      findOne: jest.fn().mockResolvedValue(EMPLOYEE_ENTITY),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectMemberService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProjectService, useValue: projects },
        { provide: EmployeeService, useValue: employees },
      ],
    }).compile();

    service = moduleRef.get(ProjectMemberService);
  });

  describe('findRoster', () => {
    beforeEach(() => {
      prisma.projectMember.findMany.mockResolvedValue([ROSTER_ROW]);
      prisma.projectMember.count.mockResolvedValue(1);
    });

    it('publishes the project once and the members without it', async () => {
      const result = await service.findRoster('prj-1', defaultQuery());

      expect(result.project).toBe(PROJECT_ENTITY);
      expect(result.members).toEqual([ROSTER_ENTRY]);
      expect(result.members[0]).not.toHaveProperty('project');
    });

    it('describes the members in meta, not the project', async () => {
      prisma.projectMember.count.mockResolvedValue(6);

      const { meta } = await service.findRoster('prj-1', defaultQuery());

      expect(meta).toEqual({
        page: 1,
        limit: 20,
        total: 6,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      });
    });

    it('never reads the project column on the member rows', async () => {
      await service.findRoster('prj-1', defaultQuery());

      const [{ select }] = prisma.projectMember.findMany.mock.calls[0] as [
        { select: Record<string, unknown> },
      ];

      expect(select).not.toHaveProperty('project');
      expect(select).toHaveProperty('employee');
    });

    it('never reaches the account behind an employee', async () => {
      await service.findRoster('prj-1', defaultQuery());

      const [{ select }] = prisma.projectMember.findMany.mock.calls[0] as [
        { select: { employee: { select: Record<string, unknown> } } },
      ];

      expect(select.employee.select).not.toHaveProperty('user');
      expect(select.employee.select).not.toHaveProperty('phone');
    });

    it('scopes the query to the project from the path', async () => {
      await service.findRoster('prj-1', defaultQuery());

      expect(prisma.projectMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: 'prj-1' } }),
      );
    });

    it('narrows the roster with the shared filters', async () => {
      await service.findRoster('prj-1', defaultQuery({ activeOnly: true }));

      expect(prisma.projectMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ leftAt: null }], projectId: 'prj-1' },
        }),
      );
    });

    it('treats activeOnly=false as unfiltered, not as "ended only"', async () => {
      await service.findRoster('prj-1', defaultQuery({ activeOnly: false }));

      expect(prisma.projectMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: 'prj-1' } }),
      );
    });

    it('breaks ties on the whole primary key, not on one half of it', async () => {
      await service.findRoster(
        'prj-1',
        defaultQuery({ sortOrder: SortOrder.DESC }),
      );

      expect(prisma.projectMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { joinedAt: 'desc' },
            { projectId: 'asc' },
            { employeeId: 'asc' },
          ],
        }),
      );
    });

    it('places open memberships last however leftAt is ordered', async () => {
      await service.findRoster(
        'prj-1',
        defaultQuery({ sortBy: 'leftAt', sortOrder: SortOrder.DESC }),
      );

      expect(prisma.projectMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { leftAt: { sort: 'desc', nulls: 'last' } },
            { projectId: 'asc' },
            { employeeId: 'asc' },
          ],
        }),
      );
    });

    it('translates the page request into skip and take', async () => {
      await service.findRoster('prj-1', defaultQuery({ page: 3, limit: 10 }));

      expect(prisma.projectMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('counts with the same filter the page was read with', async () => {
      await service.findRoster('prj-1', defaultQuery({ activeOnly: true }));

      const [{ where: listedWith }] = prisma.projectMember.findMany.mock
        .calls[0] as [{ where: unknown }];
      const [{ where: countedWith }] = prisma.projectMember.count.mock
        .calls[0] as [{ where: unknown }];

      expect(countedWith).toEqual(listedWith);
    });

    it('reads the rows and the total under one transaction', async () => {
      await service.findRoster('prj-1', defaultQuery());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('reads the project through the service that owns it', async () => {
      await service.findRoster('prj-1', defaultQuery());

      expect(projects.findOne).toHaveBeenCalledWith('prj-1');
    });

    it('lets the 404 for an unknown project through, without listing members', async () => {
      projects.findOne.mockRejectedValue(new NotFoundException());

      await expect(
        service.findRoster('missing', defaultQuery()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.projectMember.findMany).not.toHaveBeenCalled();
    });

    it('returns a project nobody is on, rather than nothing at all', async () => {
      prisma.projectMember.findMany.mockResolvedValue([]);
      prisma.projectMember.count.mockResolvedValue(0);

      const result = await service.findRoster('prj-1', defaultQuery());

      expect(result.project).toBe(PROJECT_ENTITY);
      expect(result.members).toEqual([]);
    });
  });

  describe('findAssignments', () => {
    beforeEach(() => {
      prisma.projectMember.findMany.mockResolvedValue([ASSIGNMENT_ROW]);
      prisma.projectMember.count.mockResolvedValue(1);
    });

    it('publishes the employee once and the projects without them', async () => {
      const result = await service.findAssignments('emp-1', defaultQuery());

      expect(result.employee).toBe(EMPLOYEE_ENTITY);
      expect(result.projects).toEqual([ASSIGNMENT_ENTRY]);
      expect(result.projects[0]).not.toHaveProperty('employee');
    });

    it('never reads the employee columns on the assignment rows', async () => {
      await service.findAssignments('emp-1', defaultQuery());

      const [{ select }] = prisma.projectMember.findMany.mock.calls[0] as [
        { select: Record<string, unknown> },
      ];

      expect(select).not.toHaveProperty('employee');
      expect(select).toHaveProperty('project');
    });

    it('scopes the query to the employee from the path', async () => {
      await service.findAssignments('emp-1', defaultQuery());

      expect(prisma.projectMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { employeeId: 'emp-1' } }),
      );
    });

    it('narrows with the same filters the roster uses', async () => {
      await service.findAssignments(
        'emp-1',
        defaultQuery({ activeOnly: true }),
      );

      expect(prisma.projectMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ leftAt: null }], employeeId: 'emp-1' },
        }),
      );
    });

    it('reads the employee through the service that owns them', async () => {
      await service.findAssignments('emp-1', defaultQuery());

      expect(employees.findOne).toHaveBeenCalledWith('emp-1');
    });

    it('lets the 404 for an unknown employee through, without listing', async () => {
      employees.findOne.mockRejectedValue(new NotFoundException());

      await expect(
        service.findAssignments('missing', defaultQuery()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.projectMember.findMany).not.toHaveBeenCalled();
    });

    it('returns an employee on no projects, rather than nothing at all', async () => {
      prisma.projectMember.findMany.mockResolvedValue([]);
      prisma.projectMember.count.mockResolvedValue(0);

      const result = await service.findAssignments('emp-1', defaultQuery());

      expect(result.employee).toBe(EMPLOYEE_ENTITY);
      expect(result.projects).toEqual([]);
    });

    it('reads the rows and the total under one transaction', async () => {
      await service.findAssignments('emp-1', defaultQuery());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('returns the membership without the project the URL supplied', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(ROSTER_ROW);

      const result = await service.findOne('prj-1', 'emp-1');

      expect(result).toEqual(ROSTER_ENTRY);
      expect(result).not.toHaveProperty('project');
    });

    it('addresses the row through the composite key', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(ROSTER_ROW);

      await service.findOne('prj-1', 'emp-1');

      expect(prisma.projectMember.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: KEY }),
      );
    });

    it('throws 404 for a pair that is not a membership', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(service.findOne('prj-1', 'emp-9')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.projectMember.findUnique.mockResolvedValue(null);
      prisma.projectMember.create.mockResolvedValue(ROSTER_ROW);
    });

    it('creates and returns the membership when nothing objects', async () => {
      await expect(service.create('prj-1', CREATE_BODY)).resolves.toEqual(
        ROSTER_ENTRY,
      );
    });

    it('takes the project from the path and the employee from the body', async () => {
      await service.create('prj-1', CREATE_BODY);

      expect(prisma.projectMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: 'prj-1',
            employeeId: 'emp-1',
          }) as unknown,
        }),
      );
    });

    it('confirms both sides through the services that own them', async () => {
      await service.create('prj-1', CREATE_BODY);

      expect(projects.exists).toHaveBeenCalledWith('prj-1');
      expect(employees.findStatus).toHaveBeenCalledWith('emp-1');
    });

    it('answers 404 for a project that does not exist — it is the collection', async () => {
      projects.exists.mockResolvedValue(false);

      await expect(
        service.create('missing', CREATE_BODY),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.projectMember.create).not.toHaveBeenCalled();
    });

    it('answers 400 for an employee that does not exist — it is the payload', async () => {
      employees.findStatus.mockResolvedValue(null);

      await expect(service.create('prj-1', CREATE_BODY)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.projectMember.create).not.toHaveBeenCalled();
    });

    it('checks the project before the employee, so a bad path wins', async () => {
      projects.exists.mockResolvedValue(false);
      employees.findStatus.mockResolvedValue(null);

      await expect(
        service.create('missing', CREATE_BODY),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to open a membership for a terminated employee', async () => {
      employees.findStatus.mockResolvedValue(EmployeeStatus.TERMINATED);

      await expect(service.create('prj-1', CREATE_BODY)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.projectMember.create).not.toHaveBeenCalled();
    });

    it('still accepts a closed membership for a terminated employee', async () => {
      employees.findStatus.mockResolvedValue(EmployeeStatus.TERMINATED);

      await expect(
        service.create('prj-1', {
          ...CREATE_BODY,
          joinedAt: '2026-01-12T00:00:00.000Z',
          leftAt: '2026-06-30T00:00:00.000Z',
        }),
      ).resolves.toEqual(ROSTER_ENTRY);
    });

    it('rejects a pair that is already a membership with a 409', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({
        projectId: 'prj-1',
      });

      await expect(service.create('prj-1', CREATE_BODY)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.projectMember.create).not.toHaveBeenCalled();
    });

    it('looks the duplicate up by the composite key', async () => {
      await service.create('prj-1', CREATE_BODY);

      expect(prisma.projectMember.findUnique).toHaveBeenCalledWith({
        where: KEY,
        select: { projectId: true },
      });
    });

    it('parses the ISO dates into the Date objects the columns hold', async () => {
      await service.create('prj-1', {
        ...CREATE_BODY,
        joinedAt: '2026-08-01',
        leftAt: '2026-12-31',
      });

      expect(prisma.projectMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            joinedAt: new Date('2026-08-01'),
            leftAt: new Date('2026-12-31'),
          }) as unknown,
        }),
      );
    });

    it('stores "now" for an omitted joinedAt rather than leaving the column to default it', async () => {
      const before = Date.now();

      await service.create('prj-1', CREATE_BODY);

      const [{ data }] = prisma.projectMember.create.mock.calls[0] as [
        { data: { joinedAt: Date; leftAt: Date | null } },
      ];

      expect(data.joinedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(data.leftAt).toBeNull();
    });

    it('judges a leftAt against the joinedAt it will actually store', async () => {
      // Without resolving `joinedAt` first this would pass validation and land
      // a membership that ended years before it began.
      await expect(
        service.create('prj-1', { ...CREATE_BODY, leftAt: '2020-01-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.projectMember.create).not.toHaveBeenCalled();
    });

    it('rejects a leftAt before the joinedAt, before touching anything else', async () => {
      await expect(
        service.create('prj-1', {
          ...CREATE_BODY,
          joinedAt: '2026-12-31',
          leftAt: '2026-08-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(projects.exists).not.toHaveBeenCalled();
      expect(prisma.projectMember.create).not.toHaveBeenCalled();
    });

    it('accepts a membership that starts and ends on the same day', async () => {
      await expect(
        service.create('prj-1', {
          ...CREATE_BODY,
          joinedAt: '2026-08-01',
          leftAt: '2026-08-01',
        }),
      ).resolves.toEqual(ROSTER_ENTRY);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.projectMember.findUnique.mockResolvedValue(ROSTER_ROW);
      prisma.projectMember.update.mockResolvedValue(ROSTER_ROW);
    });

    it('applies the patch and returns the membership', async () => {
      await expect(
        service.update('prj-1', 'emp-1', { isProjectManager: false }),
      ).resolves.toEqual(ROSTER_ENTRY);
    });

    it('leaves the dates untouched when the body does not mention them', async () => {
      await service.update('prj-1', 'emp-1', { isProjectManager: false });

      expect(prisma.projectMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: KEY,
          data: {
            isProjectManager: false,
            joinedAt: undefined,
            leftAt: undefined,
          },
        }),
      );
    });

    it('ends a membership by setting leftAt', async () => {
      await service.update('prj-1', 'emp-1', { leftAt: '2026-09-30' });

      expect(prisma.projectMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leftAt: new Date('2026-09-30'),
          }) as unknown,
        }),
      );
    });

    it('reopens a membership by clearing leftAt', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({
        ...ROSTER_ROW,
        leftAt: new Date('2026-09-30T00:00:00.000Z'),
      });

      await service.update('prj-1', 'emp-1', { leftAt: null });

      expect(prisma.projectMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ leftAt: null }) as unknown,
        }),
      );
    });

    it('judges a new leftAt against the stored joinedAt', async () => {
      await expect(
        service.update('prj-1', 'emp-1', { leftAt: '2025-07-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.projectMember.update).not.toHaveBeenCalled();
    });

    it('judges a new joinedAt against the stored leftAt', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({
        ...ROSTER_ROW,
        leftAt: new Date('2026-09-30T00:00:00.000Z'),
      });

      await expect(
        service.update('prj-1', 'emp-1', { joinedAt: '2026-10-15' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.projectMember.update).not.toHaveBeenCalled();
    });

    it('lets a correction that moves both ends together through', async () => {
      await service.update('prj-1', 'emp-1', {
        joinedAt: '2026-09-01',
        leftAt: '2026-09-30',
      });

      expect(prisma.projectMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            joinedAt: new Date('2026-09-01'),
            leftAt: new Date('2026-09-30'),
          }) as unknown,
        }),
      );
    });

    it('reports the missing membership before complaining about the body', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.update('prj-1', 'emp-9', { leftAt: '2020-01-01' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.projectMember.update).not.toHaveBeenCalled();
    });

    it('refuses to reopen the membership of a terminated employee', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({
        ...ROSTER_ROW,
        employee: { ...EMPLOYEE_SUMMARY, status: EmployeeStatus.TERMINATED },
        leftAt: new Date('2026-09-30T00:00:00.000Z'),
      });

      await expect(
        service.update('prj-1', 'emp-1', { leftAt: null }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.projectMember.update).not.toHaveBeenCalled();
    });

    it('still lets a terminated employee’s membership be corrected', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({
        ...ROSTER_ROW,
        employee: { ...EMPLOYEE_SUMMARY, status: EmployeeStatus.TERMINATED },
        leftAt: new Date('2026-09-30T00:00:00.000Z'),
      });

      await service.update('prj-1', 'emp-1', { leftAt: '2026-10-31' });

      expect(prisma.projectMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leftAt: new Date('2026-10-31'),
          }) as unknown,
        }),
      );
    });

    it('asks the employee status of the row it already read', async () => {
      await service.update('prj-1', 'emp-1', { isProjectManager: false });

      expect(employees.findStatus).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the membership addressed by the pair', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({ projectId: 'prj-1' });

      await expect(service.remove('prj-1', 'emp-1')).resolves.toBeUndefined();
      expect(prisma.projectMember.delete).toHaveBeenCalledWith({ where: KEY });
    });

    it('throws 404 for a pair that is not a membership', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(service.remove('prj-1', 'emp-9')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.projectMember.delete).not.toHaveBeenCalled();
    });
  });

  describe('closeOpenMemberships', () => {
    /** The instant the employee was terminated, as `updatedAt` records it. */
    const TERMINATED_AT = new Date('2026-08-04T09:15:00.000Z');

    /** Stands in for the transaction client `EmployeeService` passes in. */
    const tx = () =>
      prisma as unknown as Parameters<typeof service.closeOpenMemberships>[2];

    beforeEach(() => {
      prisma.projectMember.findMany.mockResolvedValue([]);
    });

    it('closes every open membership at the termination date', async () => {
      await service.closeOpenMemberships('emp-1', TERMINATED_AT, tx());

      expect(prisma.projectMember.updateMany).toHaveBeenCalledWith({
        where: {
          employeeId: 'emp-1',
          leftAt: null,
          joinedAt: { lte: TERMINATED_AT },
        },
        data: { leftAt: TERMINATED_AT },
      });
    });

    it('leaves the already closed ones alone, so the history stands', async () => {
      await service.closeOpenMemberships('emp-1', TERMINATED_AT, tx());

      const [{ where }] = prisma.projectMember.updateMany.mock.calls[0] as [
        { where: { leftAt: null } },
      ];

      expect(where.leftAt).toBeNull();
    });

    it('closes a not-yet-started membership at its own joinedAt', async () => {
      // An assignment planned for after the person left: closing it at the
      // termination date would store a period ending before it starts, which
      // is what the write endpoints refuse from callers.
      const joinedAt = new Date('2026-09-01T00:00:00.000Z');

      prisma.projectMember.findMany.mockResolvedValue([
        { projectId: 'prj-2', joinedAt },
      ]);

      await service.closeOpenMemberships('emp-1', TERMINATED_AT, tx());

      expect(prisma.projectMember.update).toHaveBeenCalledWith({
        where: {
          projectId_employeeId: { projectId: 'prj-2', employeeId: 'emp-1' },
        },
        data: { leftAt: joinedAt },
      });
    });

    it('costs a single statement when nothing starts in the future', async () => {
      await service.closeOpenMemberships('emp-1', TERMINATED_AT, tx());

      expect(prisma.projectMember.update).not.toHaveBeenCalled();
    });

    it('writes through the transaction it was given', async () => {
      const txClient = {
        projectMember: {
          updateMany: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
        },
      };

      await service.closeOpenMemberships(
        'emp-1',
        TERMINATED_AT,
        txClient as unknown as Parameters<
          typeof service.closeOpenMemberships
        >[2],
      );

      expect(txClient.projectMember.updateMany).toHaveBeenCalled();
      expect(prisma.projectMember.updateMany).not.toHaveBeenCalled();
    });
  });
});
