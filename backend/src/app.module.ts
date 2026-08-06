import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnvironment } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { DepartmentModule } from './modules/departments/department.module';
import { EmailModule } from './modules/email/email.module';
import { EmployeeLeaveBalancesModule } from './modules/employee-leave-balances/employee-leave-balances.module';
import { EmployeeModule } from './modules/employees/employee.module';
import { LeaveConfigurationModule } from './modules/leave-configuration/leave-configuration.module';
import { LeaveRequestsModule } from './modules/leave-requests/leave-requests.module';
import { NotificationDeliveryModule } from './modules/notification-delivery/notification-delivery.module';
import { NotificationManagementModule } from './modules/notification-management/notification-management.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { PermissionManagementModule } from './modules/permission-management/permission-management.module';
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
    // Installs the scheduler registry the `@Cron` jobs in the notification
    // delivery engine attach to. Registered here rather than in that module
    // because it is an application-wide facility — the same call `ConfigModule`
    // and `PrismaModule` get — and because a second `forRoot()` elsewhere would
    // be a second registry. Whether the jobs actually do anything is
    // `NOTIFICATION_SCHEDULER_ENABLED`, checked inside each of them.
    ScheduleModule.forRoot(),
    HealthModule,
    // Infrastructure rather than a resource: the only component that sends
    // email. It owns no table and depends on no business module, so it sits
    // with the shared modules above rather than in the list below. The
    // notification features will import it; nothing here does yet.
    EmailModule,
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
    // Configuration as well, and the third of the same set: which kinds of leave
    // exist and who is notified about them. It grants no leave and records no
    // request — those are later features.
    LeaveConfigurationModule,
    // Data rather than configuration, and the first module in the leave area
    // that is: how many days each person actually has, per leave type and per
    // year. Allocated by hand; nothing here approves or deducts anything.
    EmployeeLeaveBalancesModule,
    // The module that joins the leave area up: it reads all four above — the
    // schedule, the holidays, the types and the balances — and is the only one
    // that deducts. Approving a request is the first write in this application
    // that moves another module's data.
    LeaveRequestsModule,
    // The notification centre: two inboxes — one personal, one administrative —
    // that are stored, read, filtered and cleared here. It produces nothing on
    // its own and watches no other module; deciding when a notification is born
    // and delivering it belongs to the Notification Delivery Engine, which will
    // import this rather than the reverse.
    NotificationModule,
    // Configuration for the notifications above: the reminder rules the company
    // wants and the announcements it has composed. It stores both and sends
    // neither — the Notification Delivery Engine reads these tables and is the
    // only thing that turns an intention into a notification.
    NotificationManagementModule,
    // The Notification Delivery Engine: the last link in the chain and the only
    // one that reaches the outside world. It reads the two modules above and
    // sends what they describe — as an in-app notification, as an email, and as
    // a WebSocket event — on a schedule of its own. It imports them; neither
    // imports it, which is what keeps the graph acyclic.
    NotificationDeliveryModule,
    // Who may do what: the permission catalog, what each role grants by default,
    // the presets an administrator applies in one click, and where an individual
    // departs from their role. It stores that configuration and resolves it into
    // an effective set; it enforces none of it, and adds no access check to any
    // module above. Enforcement needs authentication first — every caller here
    // is still whoever they claim to be — so it is a later feature that will
    // import this one and call its resolution method.
    PermissionManagementModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
