import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permission-management/permission.service';
import { AuthorizationModule } from './authorization.module';
import { PermissionsGuard } from './permissions.guard';
import { PublicRouteValidator } from './public-route.validator';

/**
 * The module's real dependency graph, instantiated — the check
 * `ReportingModule` grew after a missing export got past every other test in
 * its feature.
 *
 * It matters more here than almost anywhere, because this module's whole
 * contribution rests on one injection: if `PermissionManagementModule` ever
 * stopped exporting `PermissionService`, the guard would fail to construct at
 * boot and every unit test in this feature would keep passing, because they all
 * hand it a stub. `compile()` throws with Nest's own
 * `UnknownDependenciesException` instead.
 *
 * `PrismaService` is the one override: the point is the wiring rather than the
 * data, and `compile()` does not run `onModuleInit`, so nothing would connect in
 * any case. Not running the lifecycle also keeps `PublicRouteValidator` quiet
 * here — it is exercised, with `init()`, in its own spec.
 */
describe('AuthorizationModule wiring', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        // Feature 036 lengthened the chain this module sits at the end of:
        // `AuthorizationModule` → `PermissionManagementModule` → `UserModule` →
        // `AuthModule`, whose token and email services read their configuration
        // in their constructors. An unconfigured deployment therefore fails at
        // startup rather than at the first onboarding — and so does this spec,
        // which is the check doing its job.
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_ACCESS_SECRET: 'wiring-access-secret-0123456789abcdef',
              JWT_REFRESH_SECRET: 'wiring-refresh-secret-0123456789abcdef',
              JWT_ACCESS_TTL: 900,
              JWT_REFRESH_TTL: 604_800,
              APP_WEB_URL: 'https://hr.example.com',
              ACCOUNT_ACTIVATION_TTL: 259_200,
              ACCOUNT_PASSWORD_RESET_TTL: 3600,
            }),
          ],
        }),
        // `@Global` makes `PrismaService` injectable everywhere *once the module
        // is in the graph*, and `AppModule` is what normally puts it there.
        PrismaModule,
        AuthorizationModule,
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
    ['PermissionsGuard', PermissionsGuard],
    ['PublicRouteValidator', PublicRouteValidator],
  ])('resolves %s from the real graph', (_name, token) => {
    expect(moduleRef.get(token)).toBeDefined();
  });

  /**
   * The dependency the whole feature is built on: 029's resolver, reached
   * through the module that owns it rather than reimplemented.
   */
  it('injects the one resolver rather than reimplementing it', () => {
    expect(moduleRef.get(PermissionService)).toBeInstanceOf(PermissionService);
  });
});
