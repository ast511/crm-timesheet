import { Test, TestingModule } from '@nestjs/testing';

import { UpdateWorkScheduleDto } from './dto/update-work-schedule.dto';
import { WorkScheduleController } from './work-schedule.controller';
import { WorkScheduleService } from './work-schedule.service';

/**
 * The controller owns no logic, so what is worth pinning is exactly that: each
 * route reaches the matching service method with the arguments it was given,
 * and adds nothing of its own on the way back.
 */
describe('WorkScheduleController', () => {
  const schedule = { workStartTime: '09:00' };
  const approvalEmail = { id: 'eml-1', email: 'hr@example.com' };

  const body = {
    workingDays: ['MONDAY'],
    workStartTime: '09:00',
    workEndTime: '18:00',
    minHoursPerEntry: 0.5,
    maxHoursPerEntry: 8,
    maxHoursPerDay: 8,
    standardHoursPerDay: 8,
    standardHoursPerWeek: 40,
    lunchBreakHours: 1,
  } as UpdateWorkScheduleDto;

  let controller: WorkScheduleController;
  let service: {
    find: jest.Mock;
    save: jest.Mock;
    findEmails: jest.Mock;
    addEmail: jest.Mock;
    removeEmail: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      find: jest.fn().mockResolvedValue(schedule),
      save: jest.fn().mockResolvedValue(schedule),
      findEmails: jest.fn().mockResolvedValue([approvalEmail]),
      addEmail: jest.fn().mockResolvedValue(approvalEmail),
      removeEmail: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [WorkScheduleController],
      providers: [{ provide: WorkScheduleService, useValue: service }],
    }).compile();

    controller = moduleRef.get(WorkScheduleController);
  });

  it('reads the configuration with no argument at all', async () => {
    await expect(controller.find()).resolves.toBe(schedule);
    expect(service.find).toHaveBeenCalledWith();
  });

  it('passes the validated body straight through to save', async () => {
    await expect(controller.save(body)).resolves.toBe(schedule);
    expect(service.save).toHaveBeenCalledWith(body);
  });

  it('lists the approval addresses', async () => {
    await expect(controller.findEmails()).resolves.toEqual([approvalEmail]);
    expect(service.findEmails).toHaveBeenCalledWith();
  });

  it('adds an approval address from the body', async () => {
    const email = { email: 'hr@example.com' };

    await expect(controller.addEmail(email)).resolves.toBe(approvalEmail);
    expect(service.addEmail).toHaveBeenCalledWith(email);
  });

  it('returns nothing from a delete, leaving the envelope to supply null', async () => {
    await expect(controller.removeEmail('eml-1')).resolves.toBeUndefined();
    expect(service.removeEmail).toHaveBeenCalledWith('eml-1');
  });
});
