import { PaginationMeta } from '../../../common/interfaces/pagination.interface';
import type { EmployeeEntity } from '../../employees/entities/employee.entity';
import type { ProjectMemberAssignmentEntry } from './project-member.entity';

/**
 * An employee and the projects they are on — what
 * `GET /api/v1/employees/:employeeId/projects` returns.
 *
 * The exact mirror of `ProjectRosterEntity`: the employee appears **once**,
 * because the URL names them, and every entry carries only the project and the
 * membership.
 *
 * `employee` is the full {@link EmployeeEntity}, not the six-field summary the
 * flat collection carries, for the reason the roster publishes the full
 * project: appearing once, it costs nothing to publish in full, and it is the
 * same representation `GET /api/v1/employees/:id` returns — so a client
 * rendering a person's page with their assignments reads one payload instead of
 * two, and types the employee once.
 *
 * `meta` describes **`projects`**. There is only one employee, so there is
 * nothing else it could describe.
 */
export class EmployeeProjectsEntity {
  employee!: EmployeeEntity;
  projects!: ProjectMemberAssignmentEntry[];
  meta!: PaginationMeta;
}
