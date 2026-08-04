import { Test, TestingModule } from '@nestjs/testing';

import { PublicHolidayQueryDto } from './dto/public-holiday-query.dto';
import { PublicHolidayController } from './public-holiday.controller';
import { PublicHolidayService } from './public-holiday.service';

/**
 * The controller owns no logic, so what is worth pinning is exactly that: each
 * route reaches the matching service method with the arguments it was given,
 * and adds nothing of its own on the way back.
 */
describe('PublicHolidayController', () => {
  const query = new PublicHolidayQueryDto();
  const page = { items: [], meta: {} };
  const holiday = { id: 'hol-1' };

  const calendar = [{ id: 'hol-1' }];

  let controller: PublicHolidayController;
  let service: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    findYear: jest.Mock;
    findMonth: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue(page),
      findOne: jest.fn().mockResolvedValue(holiday),
      findYear: jest.fn().mockResolvedValue(calendar),
      findMonth: jest.fn().mockResolvedValue(calendar),
      create: jest.fn().mockResolvedValue(holiday),
      update: jest.fn().mockResolvedValue(holiday),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PublicHolidayController],
      providers: [{ provide: PublicHolidayService, useValue: service }],
    }).compile();

    controller = moduleRef.get(PublicHolidayController);
  });

  it('passes the query straight through to the service', async () => {
    await expect(controller.findAll(query)).resolves.toBe(page);
    expect(service.findAll).toHaveBeenCalledWith(query);
  });

  it('reads one holiday by id', async () => {
    await expect(controller.findOne('hol-1')).resolves.toBe(holiday);
    expect(service.findOne).toHaveBeenCalledWith('hol-1');
  });

  it('unwraps the year parameter for the yearly calendar', async () => {
    await expect(controller.findYear({ year: 2027 })).resolves.toBe(calendar);
    expect(service.findYear).toHaveBeenCalledWith(2027);
  });

  it('unwraps both parameters for the monthly calendar, in order', async () => {
    await expect(controller.findMonth({ year: 2027, month: 5 })).resolves.toBe(
      calendar,
    );
    expect(service.findMonth).toHaveBeenCalledWith(2027, 5);
  });

  it('creates from the validated body', async () => {
    const body = {
      name: 'Christmas Day',
      type: 'FIXED' as const,
      startDate: '2025-12-25',
      endDate: '2025-12-26',
    };

    await expect(controller.create(body)).resolves.toBe(holiday);
    expect(service.create).toHaveBeenCalledWith(body);
  });

  it('updates with both the id and the body', async () => {
    const body = { validToYear: 2026 };

    await expect(controller.update('hol-1', body)).resolves.toBe(holiday);
    expect(service.update).toHaveBeenCalledWith('hol-1', body);
  });

  it('returns nothing from a delete, leaving the envelope to supply null', async () => {
    await expect(controller.remove('hol-1')).resolves.toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith('hol-1');
  });
});
