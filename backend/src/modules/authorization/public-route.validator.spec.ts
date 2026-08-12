import { Controller, Get } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { Public } from '../auth/decorators/public.decorator';
import { RequirePermission } from './decorators/require-permission.decorator';
import {
  CONTRADICTORY_ROUTE_MESSAGE,
  PublicRouteValidator,
} from './public-route.validator';

/**
 * The boot that must not happen.
 *
 * Each case compiles a small application and calls `init()`, because
 * `onModuleInit` is what runs the check — `compile()` alone constructs the
 * providers and never fires the lifecycle hook, so a spec that stopped there
 * would pass whatever the validator did.
 */

@Controller('open')
class PublicController {
  @Public()
  @Get()
  read(): void {}
}

@Controller('gated')
class GatedController {
  @Get()
  @RequirePermission('REPORTS.VIEW')
  read(): void {}
}

@Controller('contradiction')
class ContradictoryController {
  @Public()
  @Get()
  @RequirePermission('REPORTS.VIEW')
  read(): void {}
}

/** The contradiction stated at the class level instead of the method. */
@Public()
@Controller('contradictory-class')
class ContradictoryClassController {
  @Get()
  @RequirePermission('REPORTS.VIEW')
  read(): void {}

  @Get('second')
  @RequirePermission('PERMISSIONS.VIEW')
  other(): void {}
}

/**
 * Boots and then shuts down, whatever happens.
 *
 * The `finally` matters: a module that starts successfully holds an open
 * container, and leaving one behind per test is how a suite starts warning about
 * workers that will not exit.
 */
async function boot(...controllers: object[]): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [DiscoveryModule],
    controllers: controllers as never[],
    providers: [PublicRouteValidator],
  }).compile();

  try {
    await moduleRef.init();
  } finally {
    await moduleRef.close();
  }
}

describe('PublicRouteValidator', () => {
  it('starts an application whose routes are public *or* gated', async () => {
    await expect(
      boot(PublicController, GatedController),
    ).resolves.toBeUndefined();
  });

  it('refuses to start when one route is both', async () => {
    await expect(boot(ContradictoryController)).rejects.toThrow(
      CONTRADICTORY_ROUTE_MESSAGE,
    );
  });

  /**
   * The name is the whole value of failing at startup rather than per request:
   * a `401` on a public endpoint tells whoever meets it nothing about where to
   * look.
   */
  it('names the offending controller and method', async () => {
    await expect(boot(ContradictoryController)).rejects.toThrow(
      /ContradictoryController\.read/,
    );
  });

  /** A `@Public()` class makes every gated method in it a contradiction. */
  it('reports every offending route rather than the first', async () => {
    await expect(boot(ContradictoryClassController)).rejects.toThrow(
      /ContradictoryClassController\.read.*ContradictoryClassController\.other/,
    );
  });
});
