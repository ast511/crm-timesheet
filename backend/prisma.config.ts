import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma CLI configuration (`prisma generate`, `migrate`, `studio`).
 *
 * Prisma 7 no longer reads `.env` on its own, so the file is loaded here
 * explicitly. The lookup order mirrors `ConfigModule.envFilePath` in
 * `app.module.ts`: a machine-local `backend/.env` wins, the shared project-root
 * `.env` is the default. dotenv never overwrites a variable that is already
 * set, so the first file defining a key is the one that applies.
 *
 * All paths below are resolved from `backend/`, which is where the npm scripts
 * that invoke the Prisma CLI run.
 */
loadEnv({ path: ['.env', '../.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Prisma 7 reads the seed command from here rather than from
    // `package.json`. Used by `prisma db seed` and re-run automatically at the
    // end of `prisma migrate reset`.
    seed: 'ts-node prisma/seed.ts',
  },
  // Used by Migrate and Studio only. The application connects through the
  // driver adapter in `src/prisma/prisma.service.ts`, from the same variable.
  datasource: {
    url: env('DATABASE_URL'),
  },
});
