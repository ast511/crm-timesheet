import type { PositionModel } from '../../src/generated/prisma/models';

import { type SeedClient, type SeededRecords, upsertAll } from './seed-context';

interface PositionSeed {
  readonly code: string;
  readonly name: string;
  readonly description: string;
}

/**
 * Company positions — what a person does, never how senior they are.
 *
 * Seniority is a separate axis: it lives on `Employee.seniority` as the
 * `SeniorityLevel` enum, so a "Developer" can be JUNIOR or LEAD without
 * multiplying the rows here.
 */
const POSITIONS = [
  {
    code: 'MGR',
    name: 'Manager',
    description: 'Owns delivery, budget and staffing for one or more teams.',
  },
  {
    code: 'TL',
    name: 'Team Leader',
    description: 'Leads a delivery team day to day and reviews its output.',
  },
  {
    code: 'BA',
    name: 'Business Analyst',
    description:
      'Turns business needs into specifications the delivery team can build.',
  },
  {
    code: 'HR-SPEC',
    name: 'HR Specialist',
    description: 'Handles recruitment, onboarding and employee administration.',
  },
  {
    code: 'DEV',
    name: 'Developer',
    description: 'Designs, implements and tests application features.',
  },
  {
    code: 'SUP-ENG',
    name: 'Support Engineer',
    description:
      'Resolves incidents and supports systems already in production.',
  },
  {
    code: 'TECHN',
    name: 'Technician',
    description:
      'Installs, configures and repairs hardware and on-site equipment.',
  },
  {
    code: 'INTERN',
    name: 'Intern',
    description:
      'Fixed-term training role; the level of experience is recorded on the employee.',
  },
] as const satisfies readonly PositionSeed[];

/** Every position code that exists, as a union of literals. */
export type PositionCode = (typeof POSITIONS)[number]['code'];

export type SeededPositions = SeededRecords<PositionCode, PositionModel>;

/** Seeds positions. No dependencies; upserted on the unique `code`. */
export function seedPositions(prisma: SeedClient): Promise<SeededPositions> {
  return upsertAll(
    POSITIONS,
    (position) => position.code,
    ({ code, name, description }) =>
      prisma.position.upsert({
        where: { code },
        update: { name, description, isActive: true },
        create: { code, name, description },
      }),
  );
}
