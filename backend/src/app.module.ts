import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      // Exposed application-wide so feature modules never re-import it.
      isGlobal: true,
      // The repository keeps a single `.env` at the project root. A local
      // `backend/.env`, when present, wins for machine-specific overrides.
      envFilePath: ['.env', '../.env'],
    }),
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
