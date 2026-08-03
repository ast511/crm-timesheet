import { Test, TestingModule } from '@nestjs/testing';

import { EmployeeStatus, SeniorityLevel } from '../../generated/prisma/enums';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { EmployeeController } from './employee.controller';
import { EmployeeService } from './employee.service';

/**
 * The controller owns no logic, so what is worth pinning is exactly that: each
 * route reaches the matching service method with the arguments it was given,
 * and adds nothing of its own on the way back.
 */
describe('EmployeeController', () => {
  const query = new EmployeeQueryDto();
  const page = { items: [], meta: {} };
  const employee = { id: 'emp-1' };

  let controller: EmployeeController;
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
      findOne: jest.fn().mockResolvedValue(employee),
      create: jest.fn().mockResolvedValue(employee),
      update: jest.fn().mockResolvedValue(employee),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [EmployeeController],
      providers: [{ provide: EmployeeService, useValue: service }],
    }).compile();

    controller = moduleRef.get(EmployeeController);
  });

  it('passes the query straight through to the service', async () => {
    await expect(controller.findAll(query)).resolves.toBe(page);
    expect(service.findAll).toHaveBeenCalledWith(query);
  });

  it('reads one employee by id', async () => {
    await expect(controller.findOne('emp-1')).resolves.toBe(employee);
    expect(service.findOne).toHaveBeenCalledWith('emp-1');
  });

  it('creates from the validated body, relation checks left to the service', async () => {
    const body = {
      employeeCode: 'EMP-0001',
      firstName: 'Ion',
      lastName: 'Popescu',
      hireDate: '2020-01-13',
      userId: 'usr-1',
      departmentId: 'dep-1',
      positionId: 'pos-1',
      seniority: SeniorityLevel.SENIOR,
      status: EmployeeStatus.ACTIVE,
    };

    await expect(controller.create(body)).resolves.toBe(employee);
    expect(service.create).toHaveBeenCalledWith(body);
  });

  it('updates with both the id and the body', async () => {
    const body = { status: EmployeeStatus.ON_LEAVE };

    await expect(controller.update('emp-1', body)).resolves.toBe(employee);
    expect(service.update).toHaveBeenCalledWith('emp-1', body);
  });

  it('returns nothing from a delete, leaving the envelope to supply null', async () => {
    await expect(controller.remove('emp-1')).resolves.toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith('emp-1');
  });
});
