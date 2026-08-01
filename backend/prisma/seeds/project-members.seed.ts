import type { ProjectCode, SeededProjects } from './projects.seed';
import { requireSeeded, type SeedClient, utcDate } from './seed-context';
import type { EmployeeCode, SeededEmployees } from './users.seed';

interface ProjectMemberSeed {
  readonly projectCode: ProjectCode;
  readonly employeeCode: EmployeeCode;
  readonly isProjectManager: boolean;
  readonly joinedAt: string;
  /** `null` while the employee is still assigned to the project. */
  readonly leftAt: string | null;
}

/**
 * Who works on what.
 *
 * Shaped so the allocation views have something to show: several employees
 * belong to more than one project, finished projects keep their historic
 * members with a `leftAt`, and every project has exactly one manager.
 */
const PROJECT_MEMBERS = [
  // CRM TimeSheet — the current flagship, the largest team.
  {
    projectCode: 'CRM-TS',
    employeeCode: 'EMP-0002',
    isProjectManager: true,
    joinedAt: '2026-01-12',
    leftAt: null,
  },
  {
    projectCode: 'CRM-TS',
    employeeCode: 'EMP-0004',
    isProjectManager: false,
    joinedAt: '2026-01-12',
    leftAt: null,
  },
  {
    projectCode: 'CRM-TS',
    employeeCode: 'EMP-0005',
    isProjectManager: false,
    joinedAt: '2026-02-02',
    leftAt: null,
  },
  {
    projectCode: 'CRM-TS',
    employeeCode: 'EMP-0006',
    isProjectManager: false,
    joinedAt: '2026-03-02',
    leftAt: null,
  },
  {
    projectCode: 'CRM-TS',
    employeeCode: 'EMP-0007',
    isProjectManager: false,
    joinedAt: '2026-01-19',
    leftAt: null,
  },
  {
    projectCode: 'CRM-TS',
    employeeCode: 'EMP-0010',
    isProjectManager: false,
    joinedAt: '2026-02-02',
    leftAt: null,
  },

  // Internal Portal — running in parallel with CRM TimeSheet.
  {
    projectCode: 'PORTAL',
    employeeCode: 'EMP-0004',
    isProjectManager: true,
    joinedAt: '2025-03-03',
    leftAt: null,
  },
  {
    projectCode: 'PORTAL',
    employeeCode: 'EMP-0005',
    isProjectManager: false,
    joinedAt: '2025-03-17',
    leftAt: null,
  },
  {
    projectCode: 'PORTAL',
    employeeCode: 'EMP-0008',
    isProjectManager: false,
    joinedAt: '2025-05-05',
    leftAt: null,
  },

  // ERP Integration — finished; the team left when the project ended.
  {
    projectCode: 'ERP-INT',
    employeeCode: 'EMP-0001',
    isProjectManager: true,
    joinedAt: '2025-09-01',
    leftAt: '2026-06-30',
  },
  {
    projectCode: 'ERP-INT',
    employeeCode: 'EMP-0007',
    isProjectManager: false,
    joinedAt: '2025-09-01',
    leftAt: '2026-06-30',
  },
  {
    projectCode: 'ERP-INT',
    employeeCode: 'EMP-0004',
    isProjectManager: false,
    joinedAt: '2025-10-06',
    leftAt: '2026-06-30',
  },

  // Company Website — archived; history only.
  {
    projectCode: 'WEBSITE',
    employeeCode: 'EMP-0002',
    isProjectManager: true,
    joinedAt: '2024-05-06',
    leftAt: '2024-11-29',
  },
  {
    projectCode: 'WEBSITE',
    employeeCode: 'EMP-0012',
    isProjectManager: false,
    joinedAt: '2024-05-06',
    leftAt: '2024-11-29',
  },
  {
    projectCode: 'WEBSITE',
    employeeCode: 'EMP-0009',
    isProjectManager: false,
    joinedAt: '2024-06-03',
    leftAt: '2024-11-29',
  },

  // Support Platform — the most recently started project.
  {
    projectCode: 'SUPPORT',
    employeeCode: 'EMP-0008',
    isProjectManager: true,
    joinedAt: '2026-04-01',
    leftAt: null,
  },
  {
    projectCode: 'SUPPORT',
    employeeCode: 'EMP-0011',
    isProjectManager: false,
    joinedAt: '2026-04-01',
    leftAt: null,
  },
  {
    projectCode: 'SUPPORT',
    employeeCode: 'EMP-0009',
    isProjectManager: false,
    joinedAt: '2026-04-13',
    leftAt: null,
  },
] as const satisfies readonly ProjectMemberSeed[];

export interface ProjectMembersSeedContext {
  readonly projects: SeededProjects;
  readonly employees: SeededEmployees;
}

/**
 * Seeds project memberships. Depends on projects and employees — it runs last.
 *
 * `ProjectMember` has a composite primary key, so the upsert targets the
 * `projectId_employeeId` compound identifier rather than a single column.
 *
 * @returns the number of memberships seeded.
 */
export async function seedProjectMembers(
  prisma: SeedClient,
  { projects, employees }: ProjectMembersSeedContext,
): Promise<number> {
  assertEveryProjectHasAManager(projects);

  for (const member of PROJECT_MEMBERS) {
    const projectId = requireSeeded(projects, member.projectCode, 'project').id;
    const employeeId = requireSeeded(
      employees,
      member.employeeCode,
      'employee',
    ).id;

    const membership = {
      isProjectManager: member.isProjectManager,
      joinedAt: utcDate(member.joinedAt),
      leftAt: member.leftAt === null ? null : utcDate(member.leftAt),
    };

    await prisma.projectMember.upsert({
      where: { projectId_employeeId: { projectId, employeeId } },
      update: membership,
      create: { projectId, employeeId, ...membership },
    });
  }

  return PROJECT_MEMBERS.length;
}

/**
 * Guards the invariant that every project is managed by someone.
 *
 * The database cannot express it and no type can either, so it is checked
 * before the first write: adding a project without a manager then fails the
 * seed with a clear message instead of producing an unmanaged project.
 */
function assertEveryProjectHasAManager(projects: SeededProjects): void {
  const managed = new Set<ProjectCode>(
    PROJECT_MEMBERS.filter((member) => member.isProjectManager).map(
      (member) => member.projectCode,
    ),
  );

  const unmanaged = [...projects.keys()].filter((code) => !managed.has(code));

  if (unmanaged.length > 0) {
    throw new Error(
      `Every project needs a project manager; none is defined for: ${unmanaged.join(', ')}.`,
    );
  }
}
