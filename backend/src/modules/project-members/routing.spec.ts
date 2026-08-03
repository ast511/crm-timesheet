import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { EmployeeController } from '../employees/employee.controller';
import { EmployeeService } from '../employees/employee.service';
import { ProjectController } from '../projects/project.controller';
import { ProjectService } from '../projects/project.service';
import { EmployeeProjectsController } from './employee-projects.controller';
import { ProjectMemberService } from './project-member.service';
import { ProjectMembersController } from './project-members.controller';

/**
 * Both of this module's controllers hang off paths another module already owns:
 * `projects` and `employees`. Each declares deeper routes than the controller
 * that owns the prefix.
 *
 * That they do not shadow each other is a claim about how Nest's router matches
 * segments, and one worth checking rather than asserting in a comment: if `:id`
 * ever swallowed the deeper path, `GET /projects/x/members` would quietly
 * return a project instead of a roster, and every unit test in all three
 * modules would still pass.
 *
 * The controllers are registered in the order `AppModule` registers their
 * modules — the two owners before `ProjectMemberModule` — so this reproduces
 * the real resolution order rather than a favourable one.
 */
describe('routing', () => {
  let app: INestApplication;

  const projects = { findOne: jest.fn().mockResolvedValue({ id: 'prj-1' }) };
  const employees = { findOne: jest.fn().mockResolvedValue({ id: 'emp-1' }) };
  const members = {
    findRoster: jest.fn().mockResolvedValue({ project: {}, members: [] }),
    findAssignments: jest
      .fn()
      .mockResolvedValue({ employee: {}, projects: [] }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [
        ProjectController,
        EmployeeController,
        ProjectMembersController,
        EmployeeProjectsController,
      ],
      providers: [
        { provide: ProjectService, useValue: projects },
        { provide: EmployeeService, useValue: employees },
        { provide: ProjectMemberService, useValue: members },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('routes a single segment to the project', async () => {
    await request(app.getHttpServer()).get('/projects/prj-1').expect(200);

    expect(projects.findOne).toHaveBeenCalledWith('prj-1');
    expect(members.findRoster).not.toHaveBeenCalled();
  });

  it('routes the members segment to the roster, not to the project', async () => {
    await request(app.getHttpServer())
      .get('/projects/prj-1/members')
      .expect(200);

    expect(members.findRoster).toHaveBeenCalledWith('prj-1', expect.anything());
    expect(projects.findOne).not.toHaveBeenCalled();
  });

  it('routes a single segment to the employee', async () => {
    await request(app.getHttpServer()).get('/employees/emp-1').expect(200);

    expect(employees.findOne).toHaveBeenCalledWith('emp-1');
    expect(members.findAssignments).not.toHaveBeenCalled();
  });

  it('routes the projects segment to the assignments, not to the employee', async () => {
    await request(app.getHttpServer())
      .get('/employees/emp-1/projects')
      .expect(200);

    expect(members.findAssignments).toHaveBeenCalledWith(
      'emp-1',
      expect.anything(),
    );
    expect(employees.findOne).not.toHaveBeenCalled();
  });

  it('has no /project-members collection any more', async () => {
    await request(app.getHttpServer()).get('/project-members').expect(404);
  });
});
