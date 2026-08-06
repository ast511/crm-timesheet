import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  PermissionAction,
  PermissionAuditAction,
  PermissionEffect,
  PermissionResource,
  UserRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { UserService } from '../users/user.service';
import { PermissionHistoryQueryDto } from './dto/permission-history-query.dto';
import { PermissionRow } from './entities/permission.entity';
import { PermissionService } from './permission.service';
import { UserPermissionService } from './user-permission.service';

/**
 * The same four-cell catalog `permission.service.spec.ts` uses, so the two files
 * describe one system rather than two fixtures.
 */
const permission = (
  id: string,
  resource: PermissionResource,
  action: PermissionAction,
): PermissionRow => ({
  id,
  key: `${resource}.${action}`,
  resource,
  action,
  label: action,
  description: null,
  createdAt: new Date('2026-08-06T10:00:00.000Z'),
  updatedAt: new Date('2026-08-06T10:00:00.000Z'),
});

const CATALOG = [
  permission('prm-1', PermissionResource.TIMESHEET, PermissionAction.VIEW),
  permission('prm-2', PermissionResource.TIMESHEET, PermissionAction.CREATE),
  permission('prm-3', PermissionResource.TIMESHEET, PermissionAction.APPROVE),
  permission('prm-4', PermissionResource.EMPLOYEES, PermissionAction.VIEW),
];

/** The role grants the first two cells; the other two are exceptions to make. */
const BASELINE = ['prm-1', 'prm-2'];

const CALLER: CurrentUser = {
  userId: 'usr-admin',
  employeeId: 'emp-admin',
  role: UserRole.ADMIN,
  administrativeAccess: true,
};

const historyQuery = (overrides: Partial<PermissionHistoryQueryDto> = {}) =>
  Object.assign(
    new PermissionHistoryQueryDto(),
    overrides,
  ) as PermissionHistoryQueryDto;

describe('UserPermissionService', () => {
  let service: UserPermissionService;
  let prisma: {
    permission: { findMany: jest.Mock };
    permissionPreset: { findUnique: jest.Mock };
    permissionAuditLog: {
      findMany: jest.Mock;
      count: jest.Mock;
      createMany: jest.Mock;
    };
    rolePermission: { findMany: jest.Mock };
    userPermissionOverride: {
      findMany: jest.Mock;
      createMany: jest.Mock;
      deleteMany: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let users: { findRole: jest.Mock };

  /** The exceptions already stored against the target, for one test. */
  const storedOverrides = (
    ...overrides: { permissionId: string; effect: PermissionEffect }[]
  ) => {
    prisma.userPermissionOverride.findMany.mockResolvedValue(overrides);
  };

  /** The rows the transaction wrote to `user_permission_overrides`. */
  const createdOverrides = () =>
    prisma.userPermissionOverride.createMany.mock.calls[0]?.[0].data ?? [];

  /** The audit rows the transaction wrote. */
  const auditRows = () =>
    prisma.permissionAuditLog.createMany.mock.calls[0]?.[0].data ?? [];

  beforeEach(async () => {
    prisma = {
      permission: { findMany: jest.fn().mockResolvedValue(CATALOG) },
      permissionPreset: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pst-1',
          // The preset grants one baseline cell and one the role does not give.
          items: [{ permissionId: 'prm-1' }, { permissionId: 'prm-4' }],
        }),
      },
      permissionAuditLog: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      rolePermission: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            BASELINE.map((permissionId) => ({ permissionId })),
          ),
      },
      userPermissionOverride: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
      // Both forms: the array form for the paginated reads, the callback form
      // for the write path.
      $transaction: jest.fn((argument: unknown) =>
        typeof argument === 'function'
          ? (argument as (tx: unknown) => Promise<unknown>)(prisma)
          : Promise.all(argument as Promise<unknown>[]),
      ),
    };

    // Every account exists and is an ordinary USER unless a test says otherwise.
    users = { findRole: jest.fn().mockResolvedValue(UserRole.USER) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UserPermissionService,
        PermissionService,
        { provide: PrismaService, useValue: prisma },
        { provide: UserService, useValue: users },
      ],
    }).compile();

    service = moduleRef.get(UserPermissionService);
  });

  describe('findMatrix', () => {
    it('returns every cell with its source, grouped by resource', async () => {
      storedOverrides({
        permissionId: 'prm-4',
        effect: PermissionEffect.GRANT,
      });

      const matrix = await service.findMatrix('usr-1');

      expect(matrix).toMatchObject({
        userId: 'usr-1',
        role: UserRole.USER,
        readOnly: false,
        grantedCount: 3,
        totalCount: 4,
      });
      expect(matrix.resources).toEqual([
        {
          resource: PermissionResource.TIMESHEET,
          permissions: [
            expect.objectContaining({ key: 'TIMESHEET.VIEW', source: 'ROLE' }),
            expect.objectContaining({
              key: 'TIMESHEET.CREATE',
              source: 'ROLE',
            }),
            expect.objectContaining({
              key: 'TIMESHEET.APPROVE',
              source: 'NONE',
            }),
          ],
        },
        {
          resource: PermissionResource.EMPLOYEES,
          permissions: [
            expect.objectContaining({
              key: 'EMPLOYEES.VIEW',
              source: 'OVERRIDE_GRANT',
            }),
          ],
        },
      ]);
    });

    it('marks a superadmin target read-only and fully granted', async () => {
      users.findRole.mockResolvedValue(UserRole.SUPERADMIN);

      const matrix = await service.findMatrix('usr-9');

      expect(matrix).toMatchObject({
        readOnly: true,
        grantedCount: 4,
        totalCount: 4,
      });
    });

    it('reports a user who is not there', async () => {
      users.findRole.mockResolvedValue(null);

      await expect(service.findMatrix('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('replace', () => {
    it('stores only genuine deviations and drops the redundant ones', async () => {
      // The body asks for one baseline cell and one the role does not give. The
      // first needs no override at all — the baseline already says it.
      await service.replace('usr-1', CALLER, {
        permissionKeys: ['TIMESHEET.VIEW', 'EMPLOYEES.VIEW'],
      });

      expect(createdOverrides()).toEqual([
        {
          userId: 'usr-1',
          permissionId: 'prm-2',
          effect: PermissionEffect.REVOKE,
        },
        {
          userId: 'usr-1',
          permissionId: 'prm-4',
          effect: PermissionEffect.GRANT,
        },
      ]);
    });

    it('writes one audit row per changed permission, with old and new', async () => {
      await service.replace('usr-1', CALLER, {
        permissionKeys: ['TIMESHEET.VIEW', 'EMPLOYEES.VIEW'],
      });

      expect(auditRows()).toEqual([
        {
          targetUserId: 'usr-1',
          changedByUserId: 'usr-admin',
          permissionId: 'prm-2',
          action: PermissionAuditAction.PERMISSION_REVOKED,
          previousEffect: null,
          newEffect: PermissionEffect.REVOKE,
          presetId: null,
        },
        {
          targetUserId: 'usr-1',
          changedByUserId: 'usr-admin',
          permissionId: 'prm-4',
          action: PermissionAuditAction.PERMISSION_GRANTED,
          previousEffect: null,
          newEffect: PermissionEffect.GRANT,
          presetId: null,
        },
      ]);
    });

    it('takes changedByUserId from the caller, never from anywhere else', async () => {
      await service.replace(
        'usr-1',
        { ...CALLER, userId: 'usr-someone-else' },
        { permissionKeys: [] },
      );

      expect(
        auditRows().every(
          (row: { changedByUserId: string }) =>
            row.changedByUserId === 'usr-someone-else',
        ),
      ).toBe(true);
    });

    it('is idempotent: the same body twice writes nothing the second time', async () => {
      // First call against a clean account.
      await service.replace('usr-1', CALLER, {
        permissionKeys: ['TIMESHEET.VIEW', 'EMPLOYEES.VIEW'],
      });

      // Second call against the state the first left behind.
      jest.clearAllMocks();
      users.findRole.mockResolvedValue(UserRole.USER);
      prisma.permission.findMany.mockResolvedValue(CATALOG);
      prisma.rolePermission.findMany.mockResolvedValue(
        BASELINE.map((permissionId) => ({ permissionId })),
      );
      storedOverrides(
        { permissionId: 'prm-4', effect: PermissionEffect.GRANT },
        { permissionId: 'prm-2', effect: PermissionEffect.REVOKE },
      );

      await service.replace('usr-1', CALLER, {
        permissionKeys: ['TIMESHEET.VIEW', 'EMPLOYEES.VIEW'],
      });

      expect(prisma.permissionAuditLog.createMany).not.toHaveBeenCalled();
      expect(prisma.userPermissionOverride.createMany).not.toHaveBeenCalled();
      expect(prisma.userPermissionOverride.deleteMany).not.toHaveBeenCalled();
    });

    it('opens no transaction when nothing changes', async () => {
      storedOverrides();

      await service.replace('usr-1', CALLER, {
        permissionKeys: ['TIMESHEET.VIEW', 'TIMESHEET.CREATE'],
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('flips a stored effect in place rather than deleting and recreating it', async () => {
      // Reachable only after a *baseline* changed under a stored override: with
      // a fixed baseline a permission yields GRANT or REVOKE but never both, so
      // this models the real case — `prm-1` carries a GRANT that was an
      // exception when it was written, and a migration has since added `prm-1`
      // to the role. Intending it off now turns that stale GRANT into a REVOKE.
      //
      // Updating in place keeps `createdAt`, so "this person has had an
      // exception here since March" survives the change of direction.
      storedOverrides({
        permissionId: 'prm-1',
        effect: PermissionEffect.GRANT,
      });

      await service.replace('usr-1', CALLER, { permissionKeys: [] });

      expect(prisma.userPermissionOverride.update).toHaveBeenCalledWith({
        where: {
          userId_permissionId: { userId: 'usr-1', permissionId: 'prm-1' },
        },
        data: { effect: PermissionEffect.REVOKE },
      });
      expect(auditRows()).toContainEqual(
        expect.objectContaining({
          permissionId: 'prm-1',
          action: PermissionAuditAction.PERMISSION_REVOKED,
          previousEffect: PermissionEffect.GRANT,
          newEffect: PermissionEffect.REVOKE,
        }),
      );
    });

    it('clears an exception the new set no longer implies', async () => {
      storedOverrides({
        permissionId: 'prm-4',
        effect: PermissionEffect.GRANT,
      });

      await service.replace('usr-1', CALLER, {
        permissionKeys: ['TIMESHEET.VIEW', 'TIMESHEET.CREATE'],
      });

      expect(prisma.userPermissionOverride.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'usr-1', permissionId: { in: ['prm-4'] } },
      });
      expect(auditRows()).toEqual([
        expect.objectContaining({
          permissionId: 'prm-4',
          action: PermissionAuditAction.OVERRIDE_CLEARED,
          previousEffect: PermissionEffect.GRANT,
          newEffect: null,
        }),
      ]);
    });

    it('revokes everything the role grants when the body is empty', async () => {
      await service.replace('usr-1', CALLER, { permissionKeys: [] });

      expect(createdOverrides()).toEqual([
        {
          userId: 'usr-1',
          permissionId: 'prm-1',
          effect: PermissionEffect.REVOKE,
        },
        {
          userId: 'usr-1',
          permissionId: 'prm-2',
          effect: PermissionEffect.REVOKE,
        },
      ]);
    });

    it('rejects an unknown permission key, naming every one of them', async () => {
      await expect(
        service.replace('usr-1', CALLER, {
          permissionKeys: ['TIMESHEET.VIEW', 'PAYROLL.RUN', 'DASHBOARD.DELETE'],
        }),
      ).rejects.toMatchObject({
        response: {
          message: [
            'Permission "DASHBOARD.DELETE" does not exist',
            'Permission "PAYROLL.RUN" does not exist',
          ],
        },
      });
    });

    it('writes nothing when a key is unknown', async () => {
      await expect(
        service.replace('usr-1', CALLER, { permissionKeys: ['PAYROLL.RUN'] }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a superadmin target with a 409', async () => {
      users.findRole.mockResolvedValue(UserRole.SUPERADMIN);

      await expect(
        service.replace('usr-9', CALLER, { permissionKeys: [] }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a caller who does not exist, naming the header', async () => {
      users.findRole.mockImplementation((id: string) =>
        Promise.resolve(id === 'usr-admin' ? null : UserRole.USER),
      );

      await expect(
        service.replace('usr-1', CALLER, { permissionKeys: [] }),
      ).rejects.toMatchObject({
        response: {
          message: ['x-user-id names user usr-admin, who does not exist'],
        },
      });
    });

    it('reports a target who is not there', async () => {
      users.findRole.mockResolvedValue(null);

      await expect(
        service.replace('missing', CALLER, { permissionKeys: [] }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('applyPreset', () => {
    it('makes the effective set equal the preset', async () => {
      const matrix = await service.applyPreset('usr-1', CALLER, {
        presetKey: 'HR_STANDARD',
      });

      // The preset holds prm-1 and prm-4; the baseline holds prm-1 and prm-2.
      // prm-1 is in both and therefore stores nothing.
      expect(createdOverrides()).toEqual([
        {
          userId: 'usr-1',
          permissionId: 'prm-2',
          effect: PermissionEffect.REVOKE,
        },
        {
          userId: 'usr-1',
          permissionId: 'prm-4',
          effect: PermissionEffect.GRANT,
        },
      ]);
      expect(matrix.userId).toBe('usr-1');
    });

    it('writes a PRESET_APPLIED summary above the per-permission rows', async () => {
      await service.applyPreset('usr-1', CALLER, { presetKey: 'HR_STANDARD' });

      expect(auditRows()[0]).toEqual({
        targetUserId: 'usr-1',
        changedByUserId: 'usr-admin',
        permissionId: null,
        action: PermissionAuditAction.PRESET_APPLIED,
        previousEffect: null,
        newEffect: null,
        presetId: 'pst-1',
      });
      expect(auditRows()).toHaveLength(3);
    });

    it('records the act even when it changes nothing', async () => {
      // A preset is something somebody did; a history that omitted it would
      // leave an administrator wondering whether the click registered.
      storedOverrides(
        { permissionId: 'prm-4', effect: PermissionEffect.GRANT },
        { permissionId: 'prm-2', effect: PermissionEffect.REVOKE },
      );

      await service.applyPreset('usr-1', CALLER, { presetKey: 'HR_STANDARD' });

      expect(auditRows()).toEqual([
        expect.objectContaining({
          action: PermissionAuditAction.PRESET_APPLIED,
          presetId: 'pst-1',
        }),
      ]);
    });

    it('reports an unknown preset as a 404 naming the key', async () => {
      prisma.permissionPreset.findUnique.mockResolvedValue(null);

      await expect(
        service.applyPreset('usr-1', CALLER, { presetKey: 'NO_SUCH_PRESET' }),
      ).rejects.toMatchObject({
        response: {
          message: 'Permission preset "NO_SUCH_PRESET" was not found',
        },
      });
    });

    it('refuses a superadmin target', async () => {
      users.findRole.mockResolvedValue(UserRole.SUPERADMIN);

      await expect(
        service.applyPreset('usr-9', CALLER, { presetKey: 'HR_STANDARD' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('resetToRole', () => {
    it('deletes every exception and writes RESET_TO_ROLE', async () => {
      storedOverrides(
        { permissionId: 'prm-4', effect: PermissionEffect.GRANT },
        { permissionId: 'prm-2', effect: PermissionEffect.REVOKE },
      );

      await service.resetToRole('usr-1', CALLER);

      expect(prisma.userPermissionOverride.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'usr-1', permissionId: { in: ['prm-2', 'prm-4'] } },
      });
      expect(prisma.userPermissionOverride.createMany).not.toHaveBeenCalled();
      expect(auditRows()[0]).toMatchObject({
        action: PermissionAuditAction.RESET_TO_ROLE,
        permissionId: null,
        presetId: null,
      });
    });

    it('records each exception it cleared, old to new', async () => {
      storedOverrides({
        permissionId: 'prm-4',
        effect: PermissionEffect.GRANT,
      });

      await service.resetToRole('usr-1', CALLER);

      expect(auditRows()[1]).toEqual({
        targetUserId: 'usr-1',
        changedByUserId: 'usr-admin',
        permissionId: 'prm-4',
        action: PermissionAuditAction.OVERRIDE_CLEARED,
        previousEffect: PermissionEffect.GRANT,
        newEffect: null,
        presetId: null,
      });
    });

    it('records the act even for a user who had no exceptions', async () => {
      await service.resetToRole('usr-1', CALLER);

      expect(auditRows()).toEqual([
        expect.objectContaining({
          action: PermissionAuditAction.RESET_TO_ROLE,
        }),
      ]);
    });

    it('refuses a superadmin target', async () => {
      users.findRole.mockResolvedValue(UserRole.SUPERADMIN);

      await expect(service.resetToRole('usr-9', CALLER)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findHistory', () => {
    it('scopes to the user and reads rows and total under one snapshot', async () => {
      await service.findHistory('usr-1', historyQuery());

      expect(prisma.permissionAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { targetUserId: 'usr-1' } }),
      );
      expect(prisma.permissionAuditLog.count).toHaveBeenCalledWith({
        where: { targetUserId: 'usr-1' },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('orders newest first, with an id tie-break', async () => {
      await service.findHistory('usr-1', historyQuery());

      expect(prisma.permissionAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
      );
    });

    it('filters by action', async () => {
      await service.findHistory(
        'usr-1',
        historyQuery({ action: PermissionAuditAction.PRESET_APPLIED }),
      );

      expect(prisma.permissionAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            targetUserId: 'usr-1',
            action: PermissionAuditAction.PRESET_APPLIED,
          },
        }),
      );
    });

    it('maps a row onto one line of the tab', async () => {
      prisma.permissionAuditLog.findMany.mockResolvedValue([
        {
          id: 'aud-1',
          action: PermissionAuditAction.PERMISSION_GRANTED,
          previousEffect: null,
          newEffect: PermissionEffect.GRANT,
          permission: {
            id: 'prm-4',
            key: 'EMPLOYEES.VIEW',
            resource: PermissionResource.EMPLOYEES,
            action: PermissionAction.VIEW,
            label: 'View',
          },
          preset: null,
          changedBy: {
            id: 'usr-admin',
            email: 'maria.ionescu@example.com',
            username: 'MIO',
          },
          createdAt: new Date('2026-08-06T12:00:00.000Z'),
        },
      ]);
      prisma.permissionAuditLog.count.mockResolvedValue(1);

      const page = await service.findHistory('usr-1', historyQuery());

      expect(page.items).toEqual([
        {
          id: 'aud-1',
          action: PermissionAuditAction.PERMISSION_GRANTED,
          permission: {
            id: 'prm-4',
            key: 'EMPLOYEES.VIEW',
            resource: PermissionResource.EMPLOYEES,
            action: PermissionAction.VIEW,
            label: 'View',
          },
          preset: null,
          previousEffect: null,
          newEffect: PermissionEffect.GRANT,
          changedBy: {
            id: 'usr-admin',
            email: 'maria.ionescu@example.com',
            username: 'MIO',
          },
          createdAt: '2026-08-06T12:00:00.000Z',
        },
      ]);
    });

    it('reports a user who is not there rather than an empty page', async () => {
      // An empty history is a real state, so returning it for a mistyped id
      // would report a fact about somebody who is not there.
      users.findRole.mockResolvedValue(null);

      await expect(
        service.findHistory('missing', historyQuery()),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
