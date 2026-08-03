import { Test, TestingModule } from '@nestjs/testing';

import { PositionQueryDto } from './dto/position-query.dto';
import { PositionController } from './position.controller';
import { PositionService } from './position.service';

/**
 * The controller owns no logic, so what is worth pinning is exactly that: each
 * route reaches the matching service method with the arguments it was given,
 * and adds nothing of its own on the way back.
 */
describe('PositionController', () => {
  const query = new PositionQueryDto();
  const page = { items: [], meta: {} };
  const position = { id: 'pos-1' };

  let controller: PositionController;
  let service: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue(page),
      findOne: jest.fn().mockResolvedValue(position),
      create: jest.fn().mockResolvedValue(position),
      update: jest.fn().mockResolvedValue(position),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PositionController],
      providers: [{ provide: PositionService, useValue: service }],
    }).compile();

    controller = moduleRef.get(PositionController);
  });

  it('passes the query straight through to the service', async () => {
    await expect(controller.findAll(query)).resolves.toBe(page);
    expect(service.findAll).toHaveBeenCalledWith(query);
  });

  it('reads one position by id', async () => {
    await expect(controller.findOne('pos-1')).resolves.toBe(position);
    expect(service.findOne).toHaveBeenCalledWith('pos-1');
  });

  it('creates from the validated body', async () => {
    const body = { code: 'DEV', name: 'Developer' };

    await expect(controller.create(body)).resolves.toBe(position);
    expect(service.create).toHaveBeenCalledWith(body);
  });

  it('updates with both the id and the body', async () => {
    const body = { name: 'Senior Developer' };

    await expect(controller.update('pos-1', body)).resolves.toBe(position);
    expect(service.update).toHaveBeenCalledWith('pos-1', body);
  });

  it('returns nothing from a delete, leaving the envelope to supply null', async () => {
    await expect(controller.remove('pos-1')).resolves.toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith('pos-1');
  });
});
