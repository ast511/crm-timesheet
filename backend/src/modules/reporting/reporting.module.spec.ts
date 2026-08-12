import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ExcelReportRenderer } from './renderers/excel.renderer';
import { PdfReportRenderer } from './renderers/pdf.renderer';
import { ReportingController } from './reporting.controller';
import { ReportingModule } from './reporting.module';
import { ReportingSourceService } from './reporting-source.service';
import { ReportingService } from './reporting.service';

/**
 * The module's **real** dependency graph, instantiated.
 *
 * This spec exists because of a bug it would have caught and the rest of the
 * suite could not. Every other test in this feature substitutes its
 * collaborators — which is right, and is what makes the builders and the
 * classifier testable without a database — but it means a provider that is
 * injected and never *exported by the module that owns it* looks perfectly fine
 * to all of them. `npm run build` does not catch it either: TypeScript resolves
 * the import, and only Nest's injector, at boot, discovers that
 * `WorkingDaysService` was a provider of `LeaveRequestsModule` and not part of
 * its public surface. The failure showed up on `npm run start:dev` and nowhere
 * before it.
 *
 * So this compiles the module for real: no `useValue`, no substitutes except the
 * database itself, and every provider actually constructed. If an import is
 * missing or a service is not exported, `compile()` throws with the same
 * `UnknownDependenciesException` the server would have.
 *
 * `PrismaService` is the one override, because the point is the wiring rather
 * than the data — and `compile()` does not run `onModuleInit`, so nothing would
 * connect in any case. `ConfigModule` and `ScheduleModule` are imported because
 * `AppModule` installs them globally and the delivery engine reached through
 * `TimesheetManagementModule` expects both.
 */
describe('ReportingModule wiring', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          // The signing keys, because Feature 032 put `AuthModule` in this graph
          // — `TimesheetManagementModule` reaches the delivery engine, whose
          // WebSocket gateway authenticates its handshake through `AuthService`
          // — and `TokenService` reads them in its constructor rather than on
          // first use, so an unconfigured deployment fails at startup instead of
          // at the first login. Which means it also fails here, and *that* is
          // this spec doing its job: `ignoreEnvFile` plus no `load` is the exact
          // shape of a container started without them.
          load: [
            () => ({
              JWT_ACCESS_SECRET: 'wiring-access-secret-0123456789abcdef',
              JWT_REFRESH_SECRET: 'wiring-refresh-secret-0123456789abcdef',
              JWT_ACCESS_TTL: 900,
              JWT_REFRESH_TTL: 604_800,
              // Feature 036 put `AccountTokenService` and `AccountEmailService`
              // in `AuthModule`, and both read their configuration in the
              // constructor for the reason `TokenService` does — a deployment
              // that cannot build an activation link should fail at startup
              // rather than at the first onboarding. Which means it fails here
              // too, and that is this spec doing its job.
              APP_WEB_URL: 'https://hr.example.com',
              ACCOUNT_ACTIVATION_TTL: 259_200,
              ACCOUNT_PASSWORD_RESET_TTL: 3600,
            }),
          ],
        }),
        ScheduleModule.forRoot(),
        // `@Global` makes `PrismaService` injectable everywhere *once the module
        // is in the graph*, and `AppModule` is what normally puts it there. It
        // has to be imported here for the same reason, and for `overrideProvider`
        // to have a provider to override.
        PrismaModule,
        ReportingModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it.each([
    ['ReportingService', ReportingService],
    ['ReportingSourceService', ReportingSourceService],
    ['ExcelReportRenderer', ExcelReportRenderer],
    ['PdfReportRenderer', PdfReportRenderer],
    ['ReportingController', ReportingController],
  ])('resolves %s from the real graph', (_name, token) => {
    expect(moduleRef.get(token)).toBeDefined();
  });

  /**
   * The specific dependency that was missing. It is reached through
   * `LeaveRequestsModule`, which had to export it — and reporting depends on the
   * two methods Feature 031 added to its calculator.
   */
  it('injects the six collaborators the source service reads', () => {
    const source = moduleRef.get(ReportingSourceService);

    expect(source).toBeInstanceOf(ReportingSourceService);
  });
});
