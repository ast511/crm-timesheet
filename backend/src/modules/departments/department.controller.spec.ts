import { Test, TestingModule } from '@nestjs/testing';

import { DepartmentController } from './department.controller';
import { DepartmentService } from './department.service';
import { DepartmentQueryDto } from './dto/department-query.dto';

/**
 * The controller owns no logic, so what is worth pinning is exactly that: each
 * route reaches the matching service method with the arguments it was given,
 * and adds nothing of its own on the way back.
 */
describe('DepartmentController', () => {
  const query = new DepartmentQueryDto();
  const page = { items: [], meta: {} };
  const department = { id: 'dep-1' };

  let controller: DepartmentController;
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
      findOne: jest.fn().mockResolvedValue(department),
      create: jest.fn().mockResolvedValue(department),
      update: jest.fn().mockResolvedValue(department),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [DepartmentController],
      providers: [{ provide: DepartmentService, useValue: service }],
    }).compile();

    controller = moduleRef.get(DepartmentController);
  });

  it('passes the query straight through to the service', async () => {
    await expect(controller.findAll(query)).resolves.toBe(page);
    expect(service.findAll).toHaveBeenCalledWith(query);
  });

  it('reads one department by id', async () => {
    await expect(controller.findOne('dep-1')).resolves.toBe(department);
    expect(service.findOne).toHaveBeenCalledWith('dep-1');
  });

  it('creates from the validated body', async () => {
    const body = { code: 'DEV', name: 'Development' };

    await expect(controller.create(body)).resolves.toBe(department);
    expect(service.create).toHaveBeenCalledWith(body);
  });

  it('updates with both the id and the body', async () => {
    const body = { name: 'Engineering' };

    await expect(controller.update('dep-1', body)).resolves.toBe(department);
    expect(service.update).toHaveBeenCalledWith('dep-1', body);
  });

  it('returns nothing from a delete, leaving the envelope to supply null', async () => {
    await expect(controller.remove('dep-1')).resolves.toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith('dep-1');
  });
});
