import { Test, TestingModule } from '@nestjs/testing';

import { ProjectMemberQueryDto } from './dto/project-member-query.dto';
import { ProjectMemberService } from './project-member.service';
import { ProjectMembersController } from './project-members.controller';

/**
 * The controller owns no logic, so what is worth pinning is exactly that: each
 * route reaches the matching service method with the arguments it was given,
 * and adds nothing of its own on the way back.
 *
 * The path segments are the detail to watch — passing them to the service in
 * the wrong order would produce a lookup that silently matches nothing — so
 * every item route asserts both, with values that could not be mistaken for
 * each other.
 */
describe('ProjectMembersController', () => {
  const query = new ProjectMemberQueryDto();
  const roster = { project: { id: 'prj-1' }, members: [], meta: {} };
  const member = { employee: { id: 'emp-1' }, isProjectManager: false };

  let controller: ProjectMembersController;
  let service: {
    findRoster: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findRoster: jest.fn().mockResolvedValue(roster),
      findOne: jest.fn().mockResolvedValue(member),
      create: jest.fn().mockResolvedValue(member),
      update: jest.fn().mockResolvedValue(member),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ProjectMembersController],
      providers: [{ provide: ProjectMemberService, useValue: service }],
    }).compile();

    controller = moduleRef.get(ProjectMembersController);
  });

  it('passes the project and the query straight through to the roster', async () => {
    await expect(controller.findRoster('prj-1', query)).resolves.toBe(roster);
    expect(service.findRoster).toHaveBeenCalledWith('prj-1', query);
  });

  it('reads one membership by its pair, project first', async () => {
    await expect(controller.findOne('prj-1', 'emp-1')).resolves.toBe(member);
    expect(service.findOne).toHaveBeenCalledWith('prj-1', 'emp-1');
  });

  it('creates with the project from the path and the body as sent', async () => {
    const body = { employeeId: 'emp-1' };

    await expect(controller.create('prj-1', body)).resolves.toBe(member);
    expect(service.create).toHaveBeenCalledWith('prj-1', body);
  });

  it('updates with both path segments and the body', async () => {
    const body = { isProjectManager: true };

    await expect(controller.update('prj-1', 'emp-1', body)).resolves.toBe(
      member,
    );
    expect(service.update).toHaveBeenCalledWith('prj-1', 'emp-1', body);
  });

  it('returns nothing from a delete, leaving the envelope to supply null', async () => {
    await expect(controller.remove('prj-1', 'emp-1')).resolves.toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith('prj-1', 'emp-1');
  });
});
