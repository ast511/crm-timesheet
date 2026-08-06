import { Test, TestingModule } from '@nestjs/testing';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SortOrder } from '../../common/enums/sort-order.enum';
import {
  PermissionAction,
  PermissionEffect,
  PermissionResource,
  UserRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionQueryDto } from './dto/permission-query.dto';
import { PresetQueryDto } from './dto/preset-query.dto';
import { PermissionRow } from './entities/permission.entity';
import { PermissionService } from './permission.service';

/**
 * A four-cell catalog: two resources, and on the first one an action the second
 * does not have. Small enough to assert against by hand, and wide enough that
 * grouping, filtering and the four resolution sources all have something to bite
 * on.
 */
const permission = (
  id: string,
  resource: PermissionResource,
  action: PermissionAction,
  label: string,
): PermissionRow => ({
  id,
  key: `${resource}.${action}`,
  resource,
  action,
  label,
  description: null,
  createdAt: new Date('2026-08-06T10:00:00.000Z'),
  updatedAt: new Date('2026-08-06T10:00:00.000Z'),
});

const TIMESHEET_VIEW = permission(
  'prm-1',
  PermissionResource.TIMESHEET,
  PermissionAction.VIEW,
  'View',
);
const TIMESHEET_CREATE = permission(
  'prm-2',
  PermissionResource.TIMESHEET,
  PermissionAction.CREATE,
  'Create',
);
const TIMESHEET_APPROVE = permission(
  'prm-3',
  PermissionResource.TIMESHEET,
  PermissionAction.APPROVE,
  'Approve',
);
const EMPLOYEES_VIEW = permission(
  'prm-4',
  PermissionResource.EMPLOYEES,
  PermissionAction.VIEW,
  'View',
);

const CATALOG = [
  TIMESHEET_VIEW,
  TIMESHEET_CREATE,
  TIMESHEET_APPROVE,
  EMPLOYEES_VIEW,
];

const PRESET_ROW = {
  id: 'pst-1',
  key: 'HR_STANDARD',
  name: 'HR - Standard',
  description: 'The day-to-day HR work.',
  targetRole: UserRole.HR,
  createdAt: new Date('2026-08-06T10:00:00.000Z'),
  updatedAt: new Date('2026-08-06T10:00:00.000Z'),
  _count: { items: 35 },
};

const catalogQuery = (overrides: Partial<PermissionQueryDto> = {}) =>
  Object.assign(new PermissionQueryDto(), overrides) as PermissionQueryDto;

const presetQuery = (overrides: Partial<PresetQueryDto> = {}) =>
  Object.assign(new PresetQueryDto(), overrides) as PresetQueryDto;

describe('PermissionService', () => {
  let service: PermissionService;
  let prisma: {
    permission: { findMany: jest.Mock; count: jest.Mock };
    permissionPreset: { findMany: jest.Mock; count: jest.Mock };
    rolePermission: { findMany: jest.Mock };
    userPermissionOverride: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  /** What the role grants by default, for the test that is running. */
  const baselineIs = (...ids: string[]) => {
    prisma.rolePermission.findMany.mockResolvedValue(
      ids.map((permissionId) => ({ permissionId })),
    );
  };

  /** The exceptions stored against the user, for the test that is running. */
  const overridesAre = (
    ...overrides: { permissionId: string; effect: PermissionEffect }[]
  ) => {
    prisma.userPermissionOverride.findMany.mockResolvedValue(overrides);
  };

  beforeEach(async () => {
    prisma = {
      permission: {
        findMany: jest.fn().mockResolvedValue(CATALOG),
        count: jest.fn().mockResolvedValue(CATALOG.length),
      },
      permissionPreset: {
        findMany: jest.fn().mockResolvedValue([PRESET_ROW]),
        count: jest.fn().mockResolvedValue(1),
      },
      rolePermission: { findMany: jest.fn().mockResolvedValue([]) },
      userPermissionOverride: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(PermissionService);
  });

  describe('findAll', () => {
    it('groups the page by resource, in page order', async () => {
      const result = await service.findAll(catalogQuery());

      expect(result.items).toEqual([
        {
          resource: PermissionResource.TIMESHEET,
          permissions: [
            expect.objectContaining({ key: 'TIMESHEET.VIEW' }),
            expect.objectContaining({ key: 'TIMESHEET.CREATE' }),
            expect.objectContaining({ key: 'TIMESHEET.APPROVE' }),
          ],
        },
        {
          resource: PermissionResource.EMPLOYEES,
          permissions: [expect.objectContaining({ key: 'EMPLOYEES.VIEW' })],
        },
      ]);
    });

    it('counts permissions, not groups: meta describes the catalog', async () => {
      // `page` and `limit` select permission rows, so `total` has to as well —
      // otherwise no client could tell how much of the catalog it had.
      const result = await service.findAll(catalogQuery());

      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 4,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      });
    });

    it('renders the dates as ISO strings', async () => {
      const result = await service.findAll(catalogQuery());

      expect(result.items[0].permissions[0]).toMatchObject({
        id: 'prm-1',
        key: 'TIMESHEET.VIEW',
        label: 'View',
        description: null,
        createdAt: '2026-08-06T10:00:00.000Z',
        updatedAt: '2026-08-06T10:00:00.000Z',
      });
    });

    it('reads the rows and the total under one snapshot', async () => {
      await service.findAll(catalogQuery());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('combines search, resource and action with AND', async () => {
      await service.findAll(
        catalogQuery({
          search: 'create',
          resource: PermissionResource.TIMESHEET,
          action: PermissionAction.CREATE,
        }),
      );

      expect(prisma.permission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: [
                  { key: { contains: 'create', mode: 'insensitive' } },
                  { label: { contains: 'create', mode: 'insensitive' } },
                ],
              },
              { resource: PermissionResource.TIMESHEET },
              { action: PermissionAction.CREATE },
            ],
          },
        }),
      );
    });

    it('searches key and label, case-insensitively', async () => {
      await service.findAll(catalogQuery({ search: 'APPROVE' }));

      const { where } = prisma.permission.findMany.mock.calls[0][0];

      expect(where.AND[0].OR).toEqual([
        { key: { contains: 'APPROVE', mode: 'insensitive' } },
        { label: { contains: 'APPROVE', mode: 'insensitive' } },
      ]);
    });

    it('passes no filter at all when nothing was asked for', async () => {
      // `undefined` rather than `{}`, so findMany and count agree.
      await service.findAll(catalogQuery());

      expect(prisma.permission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
      expect(prisma.permission.count).toHaveBeenCalledWith({
        where: undefined,
      });
    });

    it('orders by the requested column, then action, then id', async () => {
      await service.findAll(catalogQuery({ sortBy: 'resource' }));

      expect(prisma.permission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ resource: 'asc' }, { action: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('does not order by action twice when action is the requested column', async () => {
      await service.findAll(
        catalogQuery({ sortBy: 'action', sortOrder: SortOrder.DESC }),
      );

      expect(prisma.permission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ action: 'desc' }, { id: 'asc' }],
        }),
      );
    });

    it('translates the page into skip and take', async () => {
      await service.findAll(catalogQuery({ page: 3, limit: 10 }));

      expect(prisma.permission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('findPresets', () => {
    it('returns each card with its permission count and target role', async () => {
      const result = await service.findPresets(presetQuery());

      expect(result.items).toEqual([
        {
          id: 'pst-1',
          key: 'HR_STANDARD',
          name: 'HR - Standard',
          description: 'The day-to-day HR work.',
          targetRole: UserRole.HR,
          permissionCount: 35,
          createdAt: '2026-08-06T10:00:00.000Z',
          updatedAt: '2026-08-06T10:00:00.000Z',
        },
      ]);
    });

    it('filters by target role', async () => {
      await service.findPresets(presetQuery({ targetRole: UserRole.ADMIN }));

      expect(prisma.permissionPreset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { targetRole: UserRole.ADMIN } }),
      );
      expect(prisma.permissionPreset.count).toHaveBeenCalledWith({
        where: { targetRole: UserRole.ADMIN },
      });
    });

    it('orders by the group heading, then name, then id', async () => {
      await service.findPresets(presetQuery());

      expect(prisma.permissionPreset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ targetRole: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        }),
      );
    });
  });

  describe('resolveEffective', () => {
    it('grants the role baseline when there are no overrides', async () => {
      baselineIs('prm-1', 'prm-2');

      const resolution = await service.resolveEffective('usr-1', UserRole.USER);

      expect(
        resolution.permissions.map(({ key, granted, source }) => ({
          key,
          granted,
          source,
        })),
      ).toEqual([
        { key: 'TIMESHEET.VIEW', granted: true, source: 'ROLE' },
        { key: 'TIMESHEET.CREATE', granted: true, source: 'ROLE' },
        { key: 'TIMESHEET.APPROVE', granted: false, source: 'NONE' },
        { key: 'EMPLOYEES.VIEW', granted: false, source: 'NONE' },
      ]);
      expect(resolution.readOnly).toBe(false);
    });

    it('adds a GRANT override on top of the baseline', async () => {
      baselineIs('prm-1');
      overridesAre({
        permissionId: 'prm-4',
        effect: PermissionEffect.GRANT,
      });

      const resolution = await service.resolveEffective('usr-1', UserRole.USER);
      const employees = resolution.permissions.find(
        (cell) => cell.key === 'EMPLOYEES.VIEW',
      );

      expect(employees).toMatchObject({
        granted: true,
        source: 'OVERRIDE_GRANT',
      });
    });

    it('takes a REVOKE override off the baseline, and says so', async () => {
      // The source is what makes this distinguishable from a permission nobody
      // ever had — the whole reason the matrix publishes it.
      baselineIs('prm-1', 'prm-2');
      overridesAre({
        permissionId: 'prm-2',
        effect: PermissionEffect.REVOKE,
      });

      const resolution = await service.resolveEffective('usr-1', UserRole.USER);

      expect(
        resolution.permissions.find((cell) => cell.key === 'TIMESHEET.CREATE'),
      ).toMatchObject({ granted: false, source: 'OVERRIDE_REVOKE' });
      expect(
        resolution.permissions.find((cell) => cell.key === 'TIMESHEET.APPROVE'),
      ).toMatchObject({ granted: false, source: 'NONE' });
    });

    it('gives a superadmin the whole catalog and marks it read-only', async () => {
      const resolution = await service.resolveEffective(
        'usr-9',
        UserRole.SUPERADMIN,
      );

      expect(resolution.readOnly).toBe(true);
      expect(resolution.permissions).toHaveLength(CATALOG.length);
      expect(
        resolution.permissions.every(
          (cell) => cell.granted && cell.source === 'SUPERADMIN',
        ),
      ).toBe(true);
    });

    it('reads neither baseline nor overrides for a superadmin', async () => {
      // The bypass is a statement about what the role is, not a configuration —
      // so there is nothing to look up, and looking would resolve every cell to
      // NONE.
      await service.resolveEffective('usr-9', UserRole.SUPERADMIN);

      expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
      expect(prisma.userPermissionOverride.findMany).not.toHaveBeenCalled();
    });

    it('reads the overrides of the user being resolved, and only those', async () => {
      await service.resolveEffective('usr-7', UserRole.HR);

      expect(prisma.userPermissionOverride.findMany).toHaveBeenCalledWith({
        where: { userId: 'usr-7' },
        select: { permissionId: true, effect: true },
      });
      expect(prisma.rolePermission.findMany).toHaveBeenCalledWith({
        where: { role: UserRole.HR },
        select: { permissionId: true },
      });
    });

    it('returns every catalog permission, not only the granted ones', async () => {
      // The matrix screen draws the empty boxes too, and /me/effective reduces
      // this to the granted keys — the long list cannot be derived from the
      // short one.
      baselineIs('prm-1');

      const resolution = await service.resolveEffective('usr-1', UserRole.USER);

      expect(resolution.permissions).toHaveLength(CATALOG.length);
    });
  });

  describe('findEffectiveForCaller', () => {
    const caller = (role: UserRole): CurrentUser => ({
      userId: 'usr-1',
      employeeId: 'emp-1',
      role,
      administrativeAccess: role !== UserRole.USER,
    });

    it('reduces the resolution to the granted keys', async () => {
      baselineIs('prm-1', 'prm-4');

      await expect(
        service.findEffectiveForCaller(caller(UserRole.USER)),
      ).resolves.toEqual({
        userId: 'usr-1',
        role: UserRole.USER,
        readOnly: false,
        permissions: ['TIMESHEET.VIEW', 'EMPLOYEES.VIEW'],
        total: 2,
      });
    });

    it('takes the role from the caller rather than from a lookup', async () => {
      // The header *is* the caller's identity until authentication exists;
      // querying `users` to confirm it would check one unverified claim against
      // another.
      await service.findEffectiveForCaller(caller(UserRole.SUPERADMIN));

      expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
    });
  });
});
