import { Test, TestingModule } from '@nestjs/testing';

import { UserRole } from '../../generated/prisma/enums';
import { UserQueryDto } from './dto/user-query.dto';
import { UserController } from './user.controller';
import { UserService } from './user.service';

/**
 * The controller owns no logic, so what is worth pinning is exactly that: each
 * route reaches the matching service method with the arguments it was given,
 * and adds nothing of its own on the way back.
 */
describe('UserController', () => {
  const query = new UserQueryDto();
  const page = { items: [], meta: {} };
  const user = { id: 'usr-1' };

  let controller: UserController;
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
      findOne: jest.fn().mockResolvedValue(user),
      create: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(user),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: service }],
    }).compile();

    controller = moduleRef.get(UserController);
  });

  it('passes the query straight through to the service', async () => {
    await expect(controller.findAll(query)).resolves.toBe(page);
    expect(service.findAll).toHaveBeenCalledWith(query);
  });

  it('reads one user by id', async () => {
    await expect(controller.findOne('usr-1')).resolves.toBe(user);
    expect(service.findOne).toHaveBeenCalledWith('usr-1');
  });

  it('creates from the validated body, hashing left to the service', async () => {
    const body = {
      email: 'ana.pop@example.com',
      password: 'correct horse battery',
      role: UserRole.USER,
    };

    await expect(controller.create(body)).resolves.toBe(user);
    expect(service.create).toHaveBeenCalledWith(body);
  });

  it('updates with both the id and the body', async () => {
    const body = { isActive: false };

    await expect(controller.update('usr-1', body)).resolves.toBe(user);
    expect(service.update).toHaveBeenCalledWith('usr-1', body);
  });

  it('returns nothing from a delete, leaving the envelope to supply null', async () => {
    await expect(controller.remove('usr-1')).resolves.toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith('usr-1');
  });
});
