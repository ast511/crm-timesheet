import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';

import { PrismaClient } from '../src/generated/prisma/client';

import { seedDepartments } from './seeds/departments.seed';
import { seedPermissionPresets } from './seeds/permission-presets.seed';
import { seedPermissions } from './seeds/permissions.seed';
import { seedPositions } from './seeds/positions.seed';
import { seedProjectMembers } from './seeds/project-members.seed';
import { seedProjects } from './seeds/projects.seed';
import { seedRolePermissions } from './seeds/role-permissions.seed';
import {
  resolveSeedPassword,
  seededEmailsByRole,
  seedUsersAndEmployees,
} from './seeds/users.seed';
import { seedWorkSchedule } from './seeds/work-schedule.seed';

/**
 * Database seed entry point — orchestration only.
 *
 * Every entity is populated by its own file under `seeds/`; this file decides
 * the order they run in and reports what happened. Adding an entity means
 * adding a `seeds/<entity>.seed.ts` and one call below.
 *
 * The order follows the model dependency graph, because a child row cannot be
 * written before the parent it points at exists:
 *
 *   departments ─┐
 *   positions  ──┴─> users + employees ─┐
 *   projects ──────────────────────────┴─> project members
 *   work schedule ─> timesheet approval emails
 *   permissions ─┬─> role permissions
 *                └─> permission presets + preset items
 *
 * The schedule is independent of everything above it, so its position in the
 * order is arbitrary; it runs where it does because it was the newest at the
 * time.
 *
 * The permission catalog is independent of everything else — no permission
 * points at a user, a department or a project — but its own two children are
 * not: both resolve permission ids by key from what `seedPermissions` returns,
 * so it has to run before either. Nothing seeds a `UserPermissionOverride` or a
 * `PermissionAuditLog`: those are runtime data, written when somebody actually
 * departs from their role, and inventing one here would put an exception on a
 * development account that nobody made.
 *
 * Run it with `npm run prisma:seed` (or `npx prisma db seed`). It is
 * idempotent: every entity is upserted on a unique natural key, so running it
 * repeatedly refreshes the same rows instead of duplicating them.
 */

// Prisma 7 does not load `.env` on its own. The lookup order matches
// `prisma.config.ts` and `ConfigModule` in `app.module.ts`: a machine-local
// `backend/.env` wins, the shared project-root `.env` is the default. Loading
// it here too keeps the script runnable directly with `ts-node`, outside the
// Prisma CLI.
loadEnv({ path: ['.env', '../.env'], quiet: true });

async function main(): Promise<void> {
  assertNotProduction();

  const password = resolveSeedPassword();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }),
  });

  console.log('Seeding the database...\n');

  try {
    const departments = await seedDepartments(prisma);
    report('departments', departments.size);

    const positions = await seedPositions(prisma);
    report('positions', positions.size);

    const projects = await seedProjects(prisma);
    report('projects', projects.size);

    const employees = await seedUsersAndEmployees(prisma, {
      departments,
      positions,
      password,
    });
    report('users and employees', employees.size);

    report(
      'project members',
      await seedProjectMembers(prisma, { projects, employees }),
    );

    report('timesheet approval emails', await seedWorkSchedule(prisma));

    const permissions = await seedPermissions(prisma);
    report('permissions', permissions.size);

    report('role permissions', await seedRolePermissions(prisma, permissions));

    report(
      'permission preset items',
      await seedPermissionPresets(prisma, permissions),
    );

    printSignInSummary();
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Refuses to seed a production database.
 *
 * The seeded accounts share one development password that is documented in
 * this repository, so creating them outside development would hand out working
 * credentials.
 */
function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to seed with NODE_ENV=production: the seeded accounts share a development password published in this repository.',
    );
  }
}

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl === undefined || databaseUrl === '') {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env at the project root and set a PostgreSQL connection string.',
    );
  }

  return databaseUrl;
}

function report(entity: string, count: number): void {
  console.log(`  ${String(count).padStart(3)}  ${entity}`);
}

/**
 * Prints where to sign in, but never the password itself — logging a
 * credential is exactly what the project's logging rules forbid, and the value
 * may have been overridden with `SEED_PASSWORD`. The default is documented in
 * `FEATURES/005-database-seeding.md`.
 */
function printSignInSummary(): void {
  console.log('\nSeeded accounts:');

  for (const [role, emails] of seededEmailsByRole()) {
    console.log(`  ${role.padEnd(10)} ${emails.join(', ')}`);
  }

  console.log(
    '\nPassword: SEED_PASSWORD if set, otherwise the development default documented in FEATURES/005-database-seeding.md.',
  );
}

void main().catch((error: unknown) => {
  console.error('\nSeeding failed.');
  console.error(error);
  process.exitCode = 1;
});
