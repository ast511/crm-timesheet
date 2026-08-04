import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnvironment } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { DepartmentModule } from './modules/departments/department.module';
import { EmployeeModule } from './modules/employees/employee.module';
import { PositionModule } from './modules/positions/position.module';
import { ProjectMemberModule } from './modules/project-members/project-member.module';
import { ProjectModule } from './modules/projects/project.module';
import { PublicHolidayModule } from './modules/public-holidays/public-holiday.module';
import { UserModule } from './modules/users/user.module';
import { WorkScheduleModule } from './modules/work-schedule/work-schedule.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      // Exposed application-wide so feature modules never re-import it.
      isGlobal: true,
      // The repository keeps a single `.env` at the project root. A local
      // `backend/.env`, when present, wins for machine-specific overrides.
      envFilePath: ['.env', '../.env'],
      // Fail fast on a missing or malformed variable, and apply the declared
      // defaults, before anything else is instantiated.
      validate: validateEnvironment,
    }),
    // Global, so feature modules inject PrismaService without re-importing it.
    PrismaModule,
    HealthModule,
    // Business modules. Each one owns a resource under `/api/v1`.
    DepartmentModule,
    PositionModule,
    UserModule,
    EmployeeModule,
    ProjectModule,
    ProjectMemberModule,
    // Configuration rather than a resource: one row describing how the company
    // works, which the Timesheets module will validate against.
    WorkScheduleModule,
    // Configuration too, and the other half of the same question: the schedule
    // says which weekdays are worked, this says which of them the company is
    // nevertheless closed on.
    PublicHolidayModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
