import { Test, TestingModule } from '@nestjs/testing';

import { ProjectQueryDto } from './dto/project-query.dto';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';

/**
 * The controller owns no logic, so what is worth pinning is exactly that: each
 * route reaches the matching service method with the arguments it was given,
 * and adds nothing of its own on the way back.
 */
describe('ProjectController', () => {
  const query = new ProjectQueryDto();
  const page = { items: [], meta: {} };
  const project = { id: 'prj-1' };

  let controller: ProjectController;
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
      findOne: jest.fn().mockResolvedValue(project),
      create: jest.fn().mockResolvedValue(project),
      update: jest.fn().mockResolvedValue(project),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ProjectController],
      providers: [{ provide: ProjectService, useValue: service }],
    }).compile();

    controller = moduleRef.get(ProjectController);
  });

  it('passes the query straight through to the service', async () => {
    await expect(controller.findAll(query)).resolves.toBe(page);
    expect(service.findAll).toHaveBeenCalledWith(query);
  });

  it('reads one project by id', async () => {
    await expect(controller.findOne('prj-1')).resolves.toBe(project);
    expect(service.findOne).toHaveBeenCalledWith('prj-1');
  });

  it('creates from the validated body', async () => {
    const body = {
      code: 'CRM-TS',
      name: 'CRM TimeSheet',
      clientName: 'Internal',
      estimatedHours: 2400,
    };

    await expect(controller.create(body)).resolves.toBe(project);
    expect(service.create).toHaveBeenCalledWith(body);
  });

  it('updates with both the id and the body', async () => {
    const body = { name: 'CRM TimeSheet v2' };

    await expect(controller.update('prj-1', body)).resolves.toBe(project);
    expect(service.update).toHaveBeenCalledWith('prj-1', body);
  });

  it('returns nothing from a delete, leaving the envelope to supply null', async () => {
    await expect(controller.remove('prj-1')).resolves.toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith('prj-1');
  });
});
