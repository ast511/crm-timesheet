import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

/**
 * Single, application-wide Prisma Client bound to the NestJS lifecycle.
 *
 * Extending `PrismaClient` means every model delegate (`prisma.user`, ...) is
 * available on the injected service, so feature services never construct their
 * own client and the process keeps exactly one connection pool.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    // Prisma 7 has no built-in database driver: the connection is owned by a
    // driver adapter, which is given the URL explicitly rather than reading
    // `process.env` itself. `getOrThrow` fails at startup on a missing
    // DATABASE_URL instead of at the first query.
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');

    super({ adapter: new PrismaPg({ connectionString }) });
  }

  /**
   * Initialises the client on startup.
   *
   * This does NOT prove the database is reachable. With a Prisma 7 driver
   * adapter the underlying pool is lazy: `$connect()` resolves even against a
   * database that does not exist, and connectivity errors surface at the first
   * query instead. Measured, not assumed — see FEATURES/003. The log message
   * is worded accordingly; reachability belongs in the health check.
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma Client initialised');
  }

  /**
   * Closes the connection pool on shutdown. Requires
   * `app.enableShutdownHooks()` in `main.ts` for signal-triggered exits.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma Client disconnected');
  }
}
