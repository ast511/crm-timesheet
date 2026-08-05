import { Test, TestingModule } from '@nestjs/testing';

import {
  EmailConnectionStatus,
  EmailHealthResponseDto,
} from './dto/email-health-response.dto';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';

/**
 * The controller owns no logic, so what is worth pinning is exactly that: each
 * route reaches the matching service method with the argument it was given, and
 * adds nothing of its own on the way back.
 */
describe('EmailController', () => {
  const health: EmailHealthResponseDto = {
    configured: true,
    enabled: true,
    connection: EmailConnectionStatus.Ok,
  };

  let controller: EmailController;
  let service: { checkHealth: jest.Mock; sendTestEmail: jest.Mock };

  beforeEach(async () => {
    service = {
      checkHealth: jest.fn().mockResolvedValue(health),
      sendTestEmail: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [EmailController],
      providers: [{ provide: EmailService, useValue: service }],
    }).compile();

    controller = moduleRef.get(EmailController);
  });

  it('reports the health with no argument at all', async () => {
    await expect(controller.checkHealth()).resolves.toBe(health);
    expect(service.checkHealth).toHaveBeenCalledWith();
  });

  /**
   * The address, not the DTO: everything else about a test message is fixed, so
   * there is nothing else for the service to be told.
   */
  it('passes the validated address to the service', async () => {
    await expect(
      controller.sendTestEmail({ email: 'ana.pop@example.com' }),
    ).resolves.toBeUndefined();

    expect(service.sendTestEmail).toHaveBeenCalledWith('ana.pop@example.com');
  });

  it('lets a send failure propagate to the global filter', async () => {
    const failure = new Error('The email could not be sent');
    service.sendTestEmail.mockRejectedValue(failure);

    await expect(
      controller.sendTestEmail({ email: 'ana.pop@example.com' }),
    ).rejects.toBe(failure);
  });
});
