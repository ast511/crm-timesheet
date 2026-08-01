import type { ProjectModel } from '../../src/generated/prisma/models';

import {
  type SeedClient,
  type SeededRecords,
  upsertAll,
  utcDate,
} from './seed-context';

interface ProjectSeed {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly startDate: string;
  /** `null` while the project is still running. */
  readonly endDate: string | null;
  readonly isActive: boolean;
  readonly isArchived: boolean;
}

/**
 * Projects, covering the three states the UI has to render: running, finished
 * but still consulted, and archived.
 *
 * Dates are ISO calendar strings parsed at UTC midnight, so the seeded rows are
 * identical on every machine regardless of local time zone.
 */
const PROJECTS = [
  {
    code: 'CRM-TS',
    name: 'CRM TimeSheet',
    description:
      'Internal time tracking and project allocation platform. Current flagship project.',
    startDate: '2026-01-12',
    endDate: null,
    isActive: true,
    isArchived: false,
  },
  {
    code: 'PORTAL',
    name: 'Internal Portal',
    description:
      'Company intranet: announcements, document library and employee directory.',
    startDate: '2025-03-03',
    endDate: null,
    isActive: true,
    isArchived: false,
  },
  {
    code: 'ERP-INT',
    name: 'ERP Integration',
    description:
      'Synchronises invoicing and stock data between the ERP and the internal systems.',
    startDate: '2025-09-01',
    endDate: '2026-06-30',
    isActive: false,
    isArchived: false,
  },
  {
    code: 'WEBSITE',
    name: 'Company Website',
    description:
      'Public marketing website and careers section. Delivered and handed over.',
    startDate: '2024-05-06',
    endDate: '2024-11-29',
    isActive: false,
    isArchived: true,
  },
  {
    code: 'SUPPORT',
    name: 'Support Platform',
    description:
      'Ticketing and SLA tracking for customer support and maintenance contracts.',
    startDate: '2026-04-01',
    endDate: null,
    isActive: true,
    isArchived: false,
  },
] as const satisfies readonly ProjectSeed[];

/** Every project code that exists, as a union of literals. */
export type ProjectCode = (typeof PROJECTS)[number]['code'];

export type SeededProjects = SeededRecords<ProjectCode, ProjectModel>;

/** Seeds projects. No dependencies; upserted on the unique `code`. */
export function seedProjects(prisma: SeedClient): Promise<SeededProjects> {
  return upsertAll(
    PROJECTS,
    (project) => project.code,
    ({ code, startDate, endDate, ...project }) => {
      const dates = {
        startDate: utcDate(startDate),
        endDate: endDate === null ? null : utcDate(endDate),
      };

      return prisma.project.upsert({
        where: { code },
        update: { ...project, ...dates },
        create: { code, ...project, ...dates },
      });
    },
  );
}
