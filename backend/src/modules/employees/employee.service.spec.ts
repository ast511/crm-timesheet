import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SortOrder } from '../../common/enums/sort-order.enum';
import {
  EmployeeStatus,
  SeniorityLevel,
  UserRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { DepartmentService } from '../departments/department.service';
import { PositionService } from '../positions/position.service';
import { ProjectMemberService } from '../project-members/project-member.service';
import { UserService } from '../users/user.service';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { EmployeeService } from './employee.service';
import { EMPLOYEE_PUBLIC_SELECT } from './entities/employee.entity';

/**
 * A row as PostgreSQL returns it through `EMPLOYEE_PUBLIC_SELECT`: `Date`
 * objects rather than strings, the three relations already nested, and no
 * foreign keys — the resource carries the records, not the ids that point at
 * them.
 */
const EMPLOYEE = {
  id: 'emp-1',
  employeeCode: 'EMP-0001',
  firstName: 'Ion',
  lastName: 'Popescu',
  phone: '+40 722 123 456',
  hireDate: new Date('2020-01-13T00:00:00.000Z'),
  seniority: SeniorityLevel.SENIOR,
  status: EmployeeStatus.ACTIVE,
  canReplaceOthers: true,
  department: { id: 'dep-1', code: 'DEV', name: 'Development' },
  position: { id: 'pos-1', code: 'DEV-SR', name: 'Senior Developer' },
  user: {
    id: 'usr-1',
    email: 'ion.popescu@example.com',
    username: 'IPO',
    role: UserRole.USER,
    isActive: true,
  },
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  updatedAt: new Date('2026-08-02T11:30:00.000Z'),
};

/** The same row once mapped for the API. */
const EMPLOYEE_ENTITY = {
  ...EMPLOYEE,
  hireDate: '2020-01-13T00:00:00.000Z',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T11:30:00.000Z',
};

const VALID_CREATE = {
  employeeCode: 'EMP-0001',
  firstName: 'Ion',
  lastName: 'Popescu',
  phone: '+40 722 123 456',
  hireDate: '2020-01-13',
  userId: 'usr-1',
  departmentId: 'dep-1',
  positionId: 'pos-1',
  seniority: SeniorityLevel.SENIOR,
  status: EmployeeStatus.ACTIVE,
};

const defaultQuery = (
  overrides: Partial<EmployeeQueryDto> = {},
): EmployeeQueryDto =>
  Object.assign(new EmployeeQueryDto(), overrides) as EmployeeQueryDto;

describe('EmployeeService', () => {
  let service: EmployeeService;
  let prisma: {
    employee: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let users: { findEmployeeLink: jest.Mock };
  let departments: { exists: jest.Mock };
  let positions: { exists: jest.Mock };
  let projectMembers: { closeOpenMemberships: jest.Mock };

  beforeEach(async () => {
    prisma = {
      employee: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      // Both forms the service uses. The batch form: the real client resolves
      // it, so the mock only has to await the promises the mocked delegates
      // already returned. The callback form, which `update` uses: the client is
      // handed to the callback, and the mock hands it itself — so a write made
      // through `tx` lands on the same delegate mocks the assertions read.
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => Promise<unknown>)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };

    // The referenced rows all exist and the account is free, unless a test
    // says otherwise.
    users = {
      findEmployeeLink: jest.fn().mockResolvedValue({ employeeId: null }),
    };
    departments = { exists: jest.fn().mockResolvedValue(true) };
    positions = { exists: jest.fn().mockResolvedValue(true) };
    projectMembers = { closeOpenMemberships: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeService,
        { provide: PrismaService, useValue: prisma },
        { provide: UserService, useValue: users },
        { provide: DepartmentService, useValue: departments },
        { provide: PositionService, useValue: positions },
        { provide: ProjectMemberService, useValue: projectMembers },
      ],
    }).compile();

    service = moduleRef.get(EmployeeService);
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.employee.findMany.mockResolvedValue([EMPLOYEE]);
      prisma.employee.count.mockResolvedValue(1);
    });

    it('returns the mapped page with its metadata', async () => {
      const result = await service.findAll(defaultQuery());

      expect(result).toEqual({
        items: [EMPLOYEE_ENTITY],
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

    it('projects the relations instead of including whole rows', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: EMPLOYEE_PUBLIC_SELECT }),
      );
      expect(EMPLOYEE_PUBLIC_SELECT.user.select).not.toHaveProperty(
        'passwordHash',
      );
    });

    it('translates the page request into skip and take', async () => {
      await service.findAll(defaultQuery({ page: 3, limit: 10 }));

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('orders by the requested column and breaks ties on id', async () => {
      await service.findAll(
        defaultQuery({ sortBy: 'hireDate', sortOrder: SortOrder.DESC }),
      );

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ hireDate: 'desc' }, { id: 'asc' }],
        }),
      );
    });

    it('searches the code and both names case-insensitively', async () => {
      await service.findAll(defaultQuery({ search: 'pop' }));

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: [
                  { employeeCode: { contains: 'pop', mode: 'insensitive' } },
                  { firstName: { contains: 'pop', mode: 'insensitive' } },
                  { lastName: { contains: 'pop', mode: 'insensitive' } },
                ],
              },
            ],
          },
        }),
      );
    });

    it.each([
      ['departmentId', { departmentId: 'dep-1' }],
      ['positionId', { positionId: 'pos-1' }],
      ['seniority', { seniority: SeniorityLevel.LEAD }],
      ['status', { status: EmployeeStatus.ON_LEAVE }],
    ])('filters by %s', async (_case, filter) => {
      await service.findAll(defaultQuery(filter));

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [filter] } }),
      );
    });

    it('filters by canReplaceOthers, including the false case', async () => {
      await service.findAll(defaultQuery({ canReplaceOthers: false }));

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ canReplaceOthers: false }] },
        }),
      );
    });

    it('combines the search and every filter with AND', async () => {
      await service.findAll(
        defaultQuery({
          search: 'pop',
          departmentId: 'dep-1',
          positionId: 'pos-1',
          seniority: SeniorityLevel.SENIOR,
          status: EmployeeStatus.ACTIVE,
          canReplaceOthers: true,
        }),
      );

      const [{ where }] = prisma.employee.findMany.mock.calls[0] as [
        { where: { AND: unknown[] } },
      ];

      expect(where.AND).toHaveLength(6);
    });

    it('applies no filter when nothing was requested', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });

    it('counts with the same filter the page was read with', async () => {
      await service.findAll(
        defaultQuery({ search: 'pop', status: EmployeeStatus.ACTIVE }),
      );

      const [{ where: listedWith }] = prisma.employee.findMany.mock
        .calls[0] as [{ where: unknown }];
      const [{ where: countedWith }] = prisma.employee.count.mock.calls[0] as [
        { where: unknown },
      ];

      expect(countedWith).toEqual(listedWith);
    });

    it('reads the rows and the total under one transaction', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('returns the employee with its three relations nested', async () => {
      prisma.employee.findUnique.mockResolvedValue(EMPLOYEE);

      const employee = await service.findOne('emp-1');

      expect(employee).toEqual(EMPLOYEE_ENTITY);
      expect(employee.department).toEqual({
        id: 'dep-1',
        code: 'DEV',
        name: 'Development',
      });
      expect(employee.user).not.toHaveProperty('passwordHash');
      expect(employee).not.toHaveProperty('userId');
      expect(employee).not.toHaveProperty('departmentId');
      expect(employee).not.toHaveProperty('positionId');
    });

    it('throws 404 for an unknown id', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.employee.create.mockResolvedValue(EMPLOYEE);
    });

    it('creates and returns the employee when everything checks out', async () => {
      await expect(service.create(VALID_CREATE)).resolves.toEqual(
        EMPLOYEE_ENTITY,
      );
    });

    it('confirms each referenced row through the module that owns it', async () => {
      await service.create(VALID_CREATE);

      expect(users.findEmployeeLink).toHaveBeenCalledWith('usr-1');
      expect(departments.exists).toHaveBeenCalledWith('dep-1');
      expect(positions.exists).toHaveBeenCalledWith('pos-1');
    });

    it('parses the ISO hire date into the Date the column stores', async () => {
      await service.create(VALID_CREATE);

      const [{ data }] = prisma.employee.create.mock.calls[0] as [
        { data: { hireDate: Date } },
      ];

      expect(data.hireDate).toEqual(new Date('2020-01-13'));
    });

    it('rejects a missing department with a 400', async () => {
      departments.exists.mockResolvedValue(false);

      await expect(service.create(VALID_CREATE)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.employee.create).not.toHaveBeenCalled();
    });

    it('reports every missing reference at once', async () => {
      users.findEmployeeLink.mockResolvedValue(null);
      departments.exists.mockResolvedValue(false);
      positions.exists.mockResolvedValue(false);

      await expect(service.create(VALID_CREATE)).rejects.toMatchObject({
        response: {
          message: [
            'User usr-1 does not exist',
            'Department dep-1 does not exist',
            'Position pos-1 does not exist',
          ],
        },
      });
    });

    it('rejects a user another employee already holds', async () => {
      users.findEmployeeLink.mockResolvedValue({ employeeId: 'emp-9' });

      await expect(service.create(VALID_CREATE)).rejects.toMatchObject({
        response: {
          message: 'User usr-1 is already linked to employee emp-9',
        },
      });
      expect(prisma.employee.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate employee code, compared without case', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: 'emp-9' });

      await expect(service.create(VALID_CREATE)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.employee.findFirst).toHaveBeenCalledWith({
        where: {
          employeeCode: { equals: 'EMP-0001', mode: 'insensitive' },
        },
        select: { id: true },
      });
      expect(prisma.employee.create).not.toHaveBeenCalled();
    });

    it('checks the relations before spending a query on the code', async () => {
      departments.exists.mockResolvedValue(false);

      await expect(service.create(VALID_CREATE)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.employee.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    beforeEach(() => {
      // The stored status, which `update` reads before writing: it decides
      // whether this patch is a termination.
      prisma.employee.findUnique.mockResolvedValue({
        status: EmployeeStatus.ACTIVE,
      });
      prisma.employee.update.mockResolvedValue(EMPLOYEE);
    });

    it('reports a missing employee before looking at the body', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing', { departmentId: 'dep-2' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(departments.exists).not.toHaveBeenCalled();
      expect(prisma.employee.update).not.toHaveBeenCalled();
    });

    it('re-validates only the relations the patch actually changes', async () => {
      await service.update('emp-1', { departmentId: 'dep-2' });

      expect(departments.exists).toHaveBeenCalledWith('dep-2');
      expect(users.findEmployeeLink).not.toHaveBeenCalled();
      expect(positions.exists).not.toHaveBeenCalled();
    });

    it('skips the uniqueness query when the code does not change', async () => {
      await service.update('emp-1', { status: EmployeeStatus.ON_LEAVE });

      expect(prisma.employee.findFirst).not.toHaveBeenCalled();
    });

    it('does not treat the employee as a conflict with itself', async () => {
      await service.update('emp-1', { employeeCode: 'EMP-0001' });

      expect(prisma.employee.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ NOT: { id: 'emp-1' } }) as unknown,
        }),
      );
    });

    it('accepts the user it is already linked to', async () => {
      users.findEmployeeLink.mockResolvedValue({ employeeId: 'emp-1' });

      await expect(
        service.update('emp-1', { userId: 'usr-1' }),
      ).resolves.toEqual(EMPLOYEE_ENTITY);
    });

    it('rejects a user another employee holds', async () => {
      users.findEmployeeLink.mockResolvedValue({ employeeId: 'emp-9' });

      await expect(
        service.update('emp-1', { userId: 'usr-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.employee.update).not.toHaveBeenCalled();
    });

    it('leaves omitted fields undefined so Prisma keeps them', async () => {
      await service.update('emp-1', { seniority: SeniorityLevel.LEAD });

      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: {
          employeeCode: undefined,
          firstName: undefined,
          lastName: undefined,
          phone: undefined,
          hireDate: undefined,
          userId: undefined,
          departmentId: undefined,
          positionId: undefined,
          seniority: SeniorityLevel.LEAD,
          status: undefined,
          canReplaceOthers: undefined,
        },
        select: EMPLOYEE_PUBLIC_SELECT,
      });
    });

    it('clears the phone on an explicit null', async () => {
      await service.update('emp-1', { phone: null });

      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phone: null }) as unknown,
        }),
      );
    });

    it('parses a new hire date into a Date', async () => {
      await service.update('emp-1', { hireDate: '2021-04-05' });

      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hireDate: new Date('2021-04-05'),
          }) as unknown,
        }),
      );
    });

    it('returns the updated employee with its relations', async () => {
      await expect(
        service.update('emp-1', { canReplaceOthers: true }),
      ).resolves.toEqual(EMPLOYEE_ENTITY);
    });

    describe('termination', () => {
      /** The row the update returns once the employee has been terminated. */
      const TERMINATED = {
        ...EMPLOYEE,
        status: EmployeeStatus.TERMINATED,
        updatedAt: new Date('2026-08-04T09:15:00.000Z'),
      };

      beforeEach(() => {
        prisma.employee.update.mockResolvedValue(TERMINATED);
      });

      it('closes the open memberships at the moment of the termination', async () => {
        await service.update('emp-1', { status: EmployeeStatus.TERMINATED });

        expect(projectMembers.closeOpenMemberships).toHaveBeenCalledWith(
          'emp-1',
          TERMINATED.updatedAt,
          prisma,
        );
      });

      it('writes both inside one transaction', async () => {
        await service.update('emp-1', { status: EmployeeStatus.TERMINATED });

        expect(prisma.$transaction).toHaveBeenCalledWith(
          expect.any(Function) as unknown,
        );
        expect(projectMembers.closeOpenMemberships).toHaveBeenCalledTimes(1);
      });

      it('leaves the memberships alone on any other status', async () => {
        await service.update('emp-1', { status: EmployeeStatus.ON_LEAVE });

        expect(projectMembers.closeOpenMemberships).not.toHaveBeenCalled();
      });

      it('does not re-close them when the employee was already terminated', async () => {
        prisma.employee.findUnique.mockResolvedValue({
          status: EmployeeStatus.TERMINATED,
        });

        await service.update('emp-1', { status: EmployeeStatus.TERMINATED });

        expect(projectMembers.closeOpenMemberships).not.toHaveBeenCalled();
      });

      it('does not reopen anything when a terminated employee returns', async () => {
        prisma.employee.findUnique.mockResolvedValue({
          status: EmployeeStatus.TERMINATED,
        });

        await service.update('emp-1', { status: EmployeeStatus.ACTIVE });

        expect(projectMembers.closeOpenMemberships).not.toHaveBeenCalled();
      });
    });
  });

  describe('remove', () => {
    it('deletes an employee nothing references', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        _count: { projectMemberships: 0, leaveBalances: 0 },
      });

      await expect(service.remove('emp-1')).resolves.toBeUndefined();
      expect(prisma.employee.delete).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
      });
    });

    /**
     * Feature 022's relation. A balance is the ledger behind every leave day
     * this person was granted or took, and `ON DELETE RESTRICT` would refuse the
     * delete anyway — as a 500 rather than a message naming what is in the way.
     */
    it('throws 409 while a leave balance still references it', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        _count: { projectMemberships: 0, leaveBalances: 3 },
      });

      await expect(service.remove('emp-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.employee.delete).not.toHaveBeenCalled();
    });

    it('throws 404 for an unknown id', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.employee.delete).not.toHaveBeenCalled();
    });

    it('throws 409 while a project membership still references it', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        _count: { projectMemberships: 2, leaveBalances: 0 },
      });

      await expect(service.remove('emp-1')).rejects.toMatchObject({
        response: {
          message:
            'Employee emp-1 cannot be deleted while 2 project membership(s) reference it',
        },
      });
      expect(prisma.employee.delete).not.toHaveBeenCalled();
    });

    it('decides every answer from one read', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        _count: { projectMemberships: 0, leaveBalances: 0 },
      });

      await service.remove('emp-1');

      expect(prisma.employee.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('findStatus', () => {
    it('answers with the stored status', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        status: EmployeeStatus.TERMINATED,
      });

      await expect(service.findStatus('emp-1')).resolves.toBe(
        EmployeeStatus.TERMINATED,
      );
    });

    it('answers null for an unknown id rather than throwing', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.findStatus('missing')).resolves.toBeNull();
    });

    it('reads one column, not the row', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        status: EmployeeStatus.ACTIVE,
      });

      await service.findStatus('emp-1');

      expect(prisma.employee.findUnique).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        select: { status: true },
      });
    });
  });

  // The Notification Delivery Engine's read: who a campaign resolves to, and
  // how each of them is reached.
  describe('findDeliveryTargets', () => {
    const row = (suffix: string) => ({
      id: `emp-${suffix}`,
      user: { id: `usr-${suffix}`, email: `person${suffix}@example.com` },
    });

    beforeEach(() => {
      prisma.employee.findMany.mockResolvedValue([row('1'), row('2')]);
    });

    it('flattens each person into an employee, an account and an address', async () => {
      await expect(service.findDeliveryTargets()).resolves.toEqual([
        { employeeId: 'emp-1', userId: 'usr-1', email: 'person1@example.com' },
        { employeeId: 'emp-2', userId: 'usr-2', email: 'person2@example.com' },
      ]);
    });

    // A company announcement is for the people who work here; somebody who left
    // in July should not receive Monday's maintenance notice.
    it('excludes only terminated employees from "everybody"', async () => {
      await service.findDeliveryTargets();

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: { not: EmployeeStatus.TERMINATED } },
        }),
      );
    });

    // Somebody chose them by name; silently dropping one would leave the author
    // believing an announcement reached somebody it did not.
    it('resolves named recipients whatever their status', async () => {
      await service.findDeliveryTargets(['emp-1', 'emp-2']);

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['emp-1', 'emp-2'] } } }),
      );
    });

    it('reads the address through the user relation rather than the users table', async () => {
      await service.findDeliveryTargets();

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true, user: { select: { id: true, email: true } } },
        }),
      );
    });

    it('answers in a stable order, so a partial batch is describable', async () => {
      await service.findDeliveryTargets();

      expect(
        (
          prisma.employee.findMany.mock.calls[0][0] as {
            orderBy: Record<string, string>[];
          }
        ).orderBy,
      ).toEqual([{ lastName: 'asc' }, { firstName: 'asc' }]);
    });

    it('answers with nothing when nobody matches', async () => {
      prisma.employee.findMany.mockResolvedValue([]);

      await expect(service.findDeliveryTargets(['emp-gone'])).resolves.toEqual(
        [],
      );
    });
  });
});
