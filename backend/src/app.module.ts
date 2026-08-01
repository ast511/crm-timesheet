import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      // Exposed application-wide so feature modules never re-import it.
      isGlobal: true,
      // The repository keeps a single `.env` at the project root. A local
      // `backend/.env`, when present, wins for machine-specific overrides.
      envFilePath: ['.env', '../.env'],
    }),
    // Global, so feature modules inject PrismaService without re-importing it.
    PrismaModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
