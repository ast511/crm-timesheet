import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { CampaignSchedulerService } from './campaign-scheduler.service';
import { SCHEDULER_ENABLED_KEY } from './notification-delivery.constants';
import { NotificationDeliveryRepository } from './notification-delivery.repository';
import { NotificationDispatcher } from './notification-dispatcher.service';

const NOW = new Date('2026-08-05T09:00:00.000Z');

describe('CampaignSchedulerService', () => {
  let scheduler: CampaignSchedulerService;
  let deliveries: { findDueCampaignIds: jest.Mock };
  let dispatcher: { executeCampaign: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    deliveries = { findDueCampaignIds: jest.fn().mockResolvedValue([]) };
    dispatcher = { executeCampaign: jest.fn().mockResolvedValue({}) };
    config = { get: jest.fn().mockReturnValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignSchedulerService,
        { provide: NotificationDeliveryRepository, useValue: deliveries },
        { provide: NotificationDispatcher, useValue: dispatcher },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    scheduler = moduleRef.get(CampaignSchedulerService);
  });

  it('sends every campaign that is due', async () => {
    deliveries.findDueCampaignIds.mockResolvedValue(['cmp-1', 'cmp-2']);

    await scheduler.dispatchDueCampaigns(NOW);

    expect(deliveries.findDueCampaignIds).toHaveBeenCalledWith(NOW);
    expect(dispatcher.executeCampaign).toHaveBeenNthCalledWith(1, 'cmp-1');
    expect(dispatcher.executeCampaign).toHaveBeenNthCalledWith(2, 'cmp-2');
  });

  it('does nothing when nothing is due', async () => {
    await scheduler.dispatchDueCampaigns(NOW);

    expect(dispatcher.executeCampaign).not.toHaveBeenCalled();
  });

  // A `409` here is an ordinary outcome: the campaign was cancelled, expired or
  // claimed by another run between the scan and the send.
  it('carries on when a campaign is no longer sendable', async () => {
    deliveries.findDueCampaignIds.mockResolvedValue(['cmp-1', 'cmp-2']);
    dispatcher.executeCampaign.mockRejectedValueOnce(
      new ConflictException('already sent'),
    );

    await expect(scheduler.dispatchDueCampaigns(NOW)).resolves.toBeUndefined();
    expect(dispatcher.executeCampaign).toHaveBeenCalledTimes(2);
  });

  it('sends them one at a time rather than all at once', async () => {
    const inFlight: string[] = [];

    deliveries.findDueCampaignIds.mockResolvedValue(['cmp-1', 'cmp-2']);
    dispatcher.executeCampaign.mockImplementation((id: string) => {
      expect(inFlight).toHaveLength(0);
      inFlight.push(id);

      return Promise.resolve().then(() => {
        inFlight.pop();

        return {};
      });
    });

    await scheduler.dispatchDueCampaigns(NOW);

    expect(dispatcher.executeCampaign).toHaveBeenCalledTimes(2);
  });

  describe('the switch', () => {
    it('runs when the variable is unset', async () => {
      await scheduler.runDueCampaigns();

      expect(deliveries.findDueCampaignIds).toHaveBeenCalled();
      expect(config.get).toHaveBeenCalledWith(SCHEDULER_ENABLED_KEY);
    });

    it('stops the clock when the variable is false', async () => {
      config.get.mockReturnValue(false);

      await scheduler.runDueCampaigns();

      expect(deliveries.findDueCampaignIds).not.toHaveBeenCalled();
    });
  });

  // A backlog can take longer than a minute. The claim already makes a
  // double-send impossible; this stops two runs discovering the same thing.
  it('does not start a second tick while one is still going', async () => {
    let release = (): void => undefined;

    deliveries.findDueCampaignIds.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve([]);
          };
        }),
    );

    const first = scheduler.runDueCampaigns();
    await scheduler.runDueCampaigns();

    expect(deliveries.findDueCampaignIds).toHaveBeenCalledTimes(1);

    release();
    await first;
  });
});
