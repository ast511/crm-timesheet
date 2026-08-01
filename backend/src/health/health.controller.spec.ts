import { Test, TestingModule } from '@nestjs/testing';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let healthController: HealthController;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    healthController = moduleRef.get(HealthController);
  });

  it('reports the service as healthy', () => {
    expect(healthController.check()).toEqual({
      status: 'ok',
      service: 'backend',
    });
  });
});
