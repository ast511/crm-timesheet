import { hashPassword } from '../../src/common/password/password.hasher';
import {
  EmployeeStatus,
  SeniorityLevel,
  UserRole,
} from '../../src/generated/prisma/enums';
import type { EmployeeModel } from '../../src/generated/prisma/models';

import type { DepartmentCode, SeededDepartments } from './departments.seed';
import type { PositionCode, SeededPositions } from './positions.seed';
import {
  requireSeeded,
  type SeedClient,
  type SeededRecords,
  upsertAll,
  utcDate,
} from './seed-context';

/**
 * Development accounts and the people behind them.
 *
 * `User` and `Employee` are seeded together rather than in two files because
 * the relation is required and one-to-one: an `Employee` cannot exist without
 * its `User`, and a seeded `User` with no `Employee` would be an account this
 * application has no use for. Keeping the pair adjacent also makes the
 * dependency order impossible to get wrong.
 */

/**
 * Password given to every seeded account when `SEED_PASSWORD` is not set.
 *
 * Development-only, and deliberately obvious rather than plausible: it is
 * published in this repository, so it must never be mistaken for a real
 * credential. `prisma/seed.ts` refuses to run when `NODE_ENV=production`.
 */
export const DEFAULT_SEED_PASSWORD = 'Development123!';

/** Environment variable overriding the default development password. */
const SEED_PASSWORD_VARIABLE = 'SEED_PASSWORD';

interface EmployeeAccountSeed {
  /** Natural key of the employee, and of this seed's output map. */
  readonly employeeCode: string;

  readonly email: string;
  readonly username: string;
  readonly role: UserRole;
  /** Whether the account may sign in. Mirrors a non-working employee status. */
  readonly isActive: boolean;

  readonly firstName: string;
  readonly lastName: string;
  /** `null` where no work phone has been recorded. */
  readonly phone: string | null;
  readonly hireDate: string;

  readonly departmentCode: DepartmentCode;
  readonly positionCode: PositionCode;
  readonly seniority: SeniorityLevel;
  readonly status: EmployeeStatus;

  readonly canReplaceOthers: boolean;
  readonly maxVacationDays: number;
}

/**
 * Every `UserRole`, every `EmployeeStatus` and every `SeniorityLevel` appears
 * at least once, so the frontend can be developed against the states it will
 * actually have to render — not only the happy path.
 *
 * Names are Romanian; e-mail addresses are the ASCII transliteration and use
 * `example.com`, which RFC 2606 reserves for documentation and can never be
 * delivered to a real inbox.
 */
const EMPLOYEE_ACCOUNTS = [
  {
    employeeCode: 'EMP-0001',
    email: 'andrei.popescu@example.com',
    username: 'APO',
    role: UserRole.SUPERADMIN,
    isActive: true,
    firstName: 'Andrei',
    lastName: 'Popescu',
    phone: '+40 721 000 001',
    hireDate: '2018-02-05',
    departmentCode: 'MGMT',
    positionCode: 'MGR',
    seniority: SeniorityLevel.LEAD,
    status: EmployeeStatus.ACTIVE,
    canReplaceOthers: true,
    maxVacationDays: 25,
  },
  {
    employeeCode: 'EMP-0002',
    email: 'maria.ionescu@example.com',
    username: 'MIO',
    role: UserRole.ADMIN,
    isActive: true,
    firstName: 'Maria',
    lastName: 'Ionescu',
    phone: '+40 721 000 002',
    hireDate: '2019-06-17',
    departmentCode: 'DEV',
    positionCode: 'TL',
    seniority: SeniorityLevel.SENIOR,
    status: EmployeeStatus.ACTIVE,
    canReplaceOthers: true,
    maxVacationDays: 23,
  },
  {
    employeeCode: 'EMP-0003',
    email: 'elena.dumitrescu@example.com',
    username: 'EDU',
    role: UserRole.HR,
    isActive: true,
    firstName: 'Elena',
    lastName: 'Dumitrescu',
    phone: '+40 721 000 003',
    hireDate: '2020-01-13',
    departmentCode: 'HR',
    positionCode: 'HR-SPEC',
    seniority: SeniorityLevel.SENIOR,
    status: EmployeeStatus.ACTIVE,
    canReplaceOthers: true,
    maxVacationDays: 22,
  },
  {
    employeeCode: 'EMP-0004',
    email: 'cristian.stan@example.com',
    username: 'CST',
    role: UserRole.USER,
    isActive: true,
    firstName: 'Cristian',
    lastName: 'Stan',
    phone: '+40 721 000 004',
    hireDate: '2019-09-02',
    departmentCode: 'DEV',
    positionCode: 'DEV',
    seniority: SeniorityLevel.SENIOR,
    status: EmployeeStatus.ACTIVE,
    canReplaceOthers: true,
    maxVacationDays: 22,
  },
  {
    employeeCode: 'EMP-0005',
    email: 'ioana.marin@example.com',
    username: 'IMA',
    role: UserRole.USER,
    isActive: true,
    firstName: 'Ioana',
    lastName: 'Marin',
    phone: '+40 721 000 005',
    hireDate: '2021-04-05',
    departmentCode: 'DEV',
    positionCode: 'DEV',
    seniority: SeniorityLevel.MID,
    status: EmployeeStatus.ACTIVE,
    canReplaceOthers: false,
    maxVacationDays: 21,
  },
  {
    employeeCode: 'EMP-0006',
    email: 'vlad.georgescu@example.com',
    username: 'VGE',
    role: UserRole.USER,
    isActive: true,
    firstName: 'Vlad',
    lastName: 'Georgescu',
    phone: '+40 721 000 006',
    hireDate: '2023-10-02',
    departmentCode: 'DEV',
    positionCode: 'DEV',
    seniority: SeniorityLevel.JUNIOR,
    status: EmployeeStatus.ACTIVE,
    canReplaceOthers: false,
    maxVacationDays: 21,
  },
  {
    employeeCode: 'EMP-0007',
    email: 'alexandru.radu@example.com',
    username: 'ARA',
    role: UserRole.USER,
    isActive: true,
    firstName: 'Alexandru',
    lastName: 'Radu',
    phone: '+40 721 000 007',
    hireDate: '2020-11-16',
    departmentCode: 'BA',
    positionCode: 'BA',
    seniority: SeniorityLevel.MID,
    // On parental leave: the account still signs in, the employee does not work.
    status: EmployeeStatus.ON_LEAVE,
    canReplaceOthers: false,
    maxVacationDays: 21,
  },
  {
    employeeCode: 'EMP-0008',
    email: 'gabriela.munteanu@example.com',
    username: 'GMU',
    role: UserRole.USER,
    isActive: true,
    firstName: 'Gabriela',
    lastName: 'Munteanu',
    phone: '+40 721 000 008',
    hireDate: '2021-02-08',
    departmentCode: 'MAINT',
    positionCode: 'SUP-ENG',
    seniority: SeniorityLevel.MID,
    status: EmployeeStatus.ACTIVE,
    canReplaceOthers: true,
    maxVacationDays: 21,
  },
  {
    employeeCode: 'EMP-0009',
    email: 'stefan.constantin@example.com',
    username: 'SCO',
    role: UserRole.USER,
    isActive: false,
    firstName: 'Stefan',
    lastName: 'Constantin',
    phone: null,
    hireDate: '2022-07-04',
    departmentCode: 'TECH',
    positionCode: 'TECHN',
    seniority: SeniorityLevel.JUNIOR,
    status: EmployeeStatus.INACTIVE,
    canReplaceOthers: false,
    maxVacationDays: 21,
  },
  {
    employeeCode: 'EMP-0010',
    email: 'diana.nistor@example.com',
    username: 'DNI',
    role: UserRole.USER,
    isActive: true,
    firstName: 'Diana',
    lastName: 'Nistor',
    phone: '+40 721 000 010',
    hireDate: '2026-02-02',
    departmentCode: 'DEV',
    positionCode: 'INTERN',
    seniority: SeniorityLevel.INTERN,
    status: EmployeeStatus.ACTIVE,
    canReplaceOthers: false,
    maxVacationDays: 18,
  },
  {
    employeeCode: 'EMP-0011',
    email: 'mihai.barbu@example.com',
    username: 'MBA',
    role: UserRole.USER,
    isActive: false,
    firstName: 'Mihai',
    lastName: 'Barbu',
    phone: null,
    hireDate: '2022-03-07',
    departmentCode: 'TECH',
    positionCode: 'TECHN',
    seniority: SeniorityLevel.JUNIOR,
    status: EmployeeStatus.SUSPENDED,
    canReplaceOthers: false,
    maxVacationDays: 21,
  },
  {
    employeeCode: 'EMP-0012',
    email: 'andreea.voicu@example.com',
    username: 'AVO',
    role: UserRole.USER,
    isActive: false,
    firstName: 'Andreea',
    lastName: 'Voicu',
    phone: '+40 721 000 012',
    hireDate: '2019-01-07',
    departmentCode: 'BA',
    positionCode: 'BA',
    seniority: SeniorityLevel.SENIOR,
    status: EmployeeStatus.TERMINATED,
    canReplaceOthers: false,
    maxVacationDays: 21,
  },
] as const satisfies readonly EmployeeAccountSeed[];

/** Every employee code that exists, as a union of literals. */
export type EmployeeCode = (typeof EMPLOYEE_ACCOUNTS)[number]['employeeCode'];

export type SeededEmployees = SeededRecords<EmployeeCode, EmployeeModel>;

export interface UsersSeedContext {
  readonly departments: SeededDepartments;
  readonly positions: SeededPositions;
  /** Plain-text password to hash for every account. Never persisted as-is. */
  readonly password: string;
}

/**
 * Resolves the development password: `SEED_PASSWORD` when set, otherwise
 * {@link DEFAULT_SEED_PASSWORD}. Overriding it keeps a shared development
 * database from being reachable with a password published in this repository.
 */
export function resolveSeedPassword(): string {
  const configured = process.env[SEED_PASSWORD_VARIABLE]?.trim();

  return configured === undefined || configured === ''
    ? DEFAULT_SEED_PASSWORD
    : configured;
}

/**
 * Sign-in addresses grouped by role, in the order the roles are declared.
 *
 * Derived from the seed data rather than repeated next to it, so the summary
 * `prisma/seed.ts` prints cannot drift from the accounts actually created.
 */
export function seededEmailsByRole(): ReadonlyMap<UserRole, readonly string[]> {
  const byRole = new Map<UserRole, string[]>();

  for (const account of EMPLOYEE_ACCOUNTS) {
    const emails = byRole.get(account.role) ?? [];
    emails.push(account.email);
    byRole.set(account.role, emails);
  }

  return byRole;
}

/**
 * Seeds users and their employees. Depends on departments and positions.
 *
 * Users are upserted on the unique `email` and employees on the unique
 * `employeeCode`, so re-running updates rows instead of duplicating them.
 */
export async function seedUsersAndEmployees(
  prisma: SeedClient,
  { departments, positions, password }: UsersSeedContext,
): Promise<SeededEmployees> {
  // Hashed once per account rather than once overall: reusing a single hash
  // would mean reusing a single salt, which is not the pattern the `auth`
  // module should copy from here. `bcryptjs` runs on the main thread, so this
  // costs a few seconds at cost factor 12 — paid once, by a seed, in
  // development only.
  const accounts = await Promise.all(
    EMPLOYEE_ACCOUNTS.map(async (account) => ({
      ...account,
      passwordHash: await hashPassword(password),
    })),
  );

  return upsertAll(
    accounts,
    (account) => account.employeeCode,
    async (account) => {
      const user = await prisma.user.upsert({
        where: { email: account.email },
        // `passwordHash` is intentionally absent from `update`: bcrypt salts
        // every call, so re-hashing would rewrite the row on every run for no
        // benefit, and would silently undo a password changed while testing.
        // `prisma migrate reset` restores the defaults.
        update: {
          username: account.username,
          role: account.role,
          isActive: account.isActive,
        },
        create: {
          email: account.email,
          username: account.username,
          passwordHash: account.passwordHash,
          role: account.role,
          isActive: account.isActive,
        },
      });

      const employee = {
        userId: user.id,
        firstName: account.firstName,
        lastName: account.lastName,
        phone: account.phone,
        hireDate: utcDate(account.hireDate),
        positionId: requireSeeded(positions, account.positionCode, 'position')
          .id,
        departmentId: requireSeeded(
          departments,
          account.departmentCode,
          'department',
        ).id,
        seniority: account.seniority,
        status: account.status,
        canReplaceOthers: account.canReplaceOthers,
        maxVacationDays: account.maxVacationDays,
      };

      return prisma.employee.upsert({
        where: { employeeCode: account.employeeCode },
        update: employee,
        create: { employeeCode: account.employeeCode, ...employee },
      });
    },
  );
}
