import { Test, TestingModule } from '@nestjs/testing';

import { ProjectMemberQueryDto } from './dto/project-member-query.dto';
import { EmployeeProjectsController } from './employee-projects.controller';
import { ProjectMemberService } from './project-member.service';

/**
 * Read-only, one route, no logic of its own: what is worth pinning is that the
 * path segment and the query reach the service unchanged.
 *
 * There are deliberately no write tests, because there are no write routes.
 * Memberships are created and edited under the project — one write path for one
 * row, which is the whole point of Feature 015.
 */
describe('EmployeeProjectsController', () => {
  const query = new ProjectMemberQueryDto();
  const assignments = { employee: { id: 'emp-1' }, projects: [], meta: {} };

  let controller: EmployeeProjectsController;
  let service: { findAssignments: jest.Mock };

  beforeEach(async () => {
    service = { findAssignments: jest.fn().mockResolvedValue(assignments) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [EmployeeProjectsController],
      providers: [{ provide: ProjectMemberService, useValue: service }],
    }).compile();

    controller = moduleRef.get(EmployeeProjectsController);
  });

  it('passes the path segment and the query straight through', async () => {
    await expect(controller.findAssignments('emp-1', query)).resolves.toBe(
      assignments,
    );
    expect(service.findAssignments).toHaveBeenCalledWith('emp-1', query);
  });
});
