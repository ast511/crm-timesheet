import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';

import { PrismaClient } from '../src/generated/prisma/client';

import { seedDepartments } from './seeds/departments.seed';
import { seedPositions } from './seeds/positions.seed';
import { seedProjectMembers } from './seeds/project-members.seed';
import { seedProjects } from './seeds/projects.seed';
import {
  resolveSeedPassword,
  seededEmailsByRole,
  seedUsersAndEmployees,
} from './seeds/users.seed';

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
