// The `prisma-client` generator suffixes row types with `Model`, so
// `DepartmentModel` — not `Department` — is the shape of a `departments` row.
import type { DepartmentModel } from '../../src/generated/prisma/models';

import { type SeedClient, type SeededRecords, upsertAll } from './seed-context';

interface DepartmentSeed {
  readonly code: string;
  readonly name: string;
  readonly description: string;
}

/**
 * Company departments. `code` is the natural key: short, uppercase and stable,
 * so later seeds and re-runs can find a department without knowing its id.
 */
const DEPARTMENTS = [
  {
    code: 'MGMT',
    name: 'Management',
    description: 'Company leadership, planning and resource allocation.',
  },
  {
    code: 'DEV',
    name: 'Development',
    description: 'Software design, implementation and code review.',
  },
  {
    code: 'MAINT',
    name: 'Maintenance',
    description: 'Corrective and preventive maintenance of delivered systems.',
  },
  {
    code: 'TECH',
    name: 'Technical',
    description: 'Infrastructure, hardware and on-site technical operations.',
  },
  {
    code: 'HR',
    name: 'Human Resources',
    description: 'Recruitment, onboarding, payroll and employee relations.',
  },
  {
    code: 'BA',
    name: 'Business Analysis',
    description:
      'Requirements gathering, process modelling and acceptance criteria.',
  },
] as const satisfies readonly DepartmentSeed[];

/** Every department code that exists, as a union of literals. */
export type DepartmentCode = (typeof DEPARTMENTS)[number]['code'];

export type SeededDepartments = SeededRecords<DepartmentCode, DepartmentModel>;

/**
 * Seeds departments. No dependencies — this runs first.
 *
 * Upserted on the unique `code`, so a second run refreshes the existing rows
 * rather than inserting duplicates.
 */
export function seedDepartments(
  prisma: SeedClient,
): Promise<SeededDepartments> {
  return upsertAll(
    DEPARTMENTS,
    (department) => department.code,
    ({ code, name, description }) =>
      prisma.department.upsert({
        where: { code },
        update: { name, description, isActive: true },
        create: { code, name, description },
      }),
  );
}
