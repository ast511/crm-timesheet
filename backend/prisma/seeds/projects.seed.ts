import type {
  ProjectPriority,
  ProjectStatus,
} from '../../src/generated/prisma/enums';
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
  /** The company the work is billed to; internal work names our own. */
  readonly clientName: string;
  readonly description: string;
  /** Budgeted effort in whole hours. */
  readonly estimatedHours: number;
  /** UI accent as `#RRGGBB`, upper-case — the form the API stores. */
  readonly color: string;
  readonly projectStatus: ProjectStatus;
  readonly projectPriority: ProjectPriority;
  readonly startDate: string;
  /** `null` while the project is still running. */
  readonly endDate: string | null;
  readonly isArchived: boolean;
}

/**
 * Projects, covering the three states the UI has to render: running, finished
 * but still consulted, and archived.
 *
 * Dates are ISO calendar strings parsed at UTC midnight, so the seeded rows are
 * identical on every machine regardless of local time zone.
 *
 * Feature 011 added `clientName`, `estimatedHours` and `color`. The mix is
 * deliberate: internal and external clients, estimates spanning two orders of
 * magnitude so `?sortBy=estimatedHours` has something to order, and five
 * distinguishable accents.
 */
const PROJECTS = [
  {
    code: 'CRM-TS',
    name: 'CRM TimeSheet',
    clientName: 'Internal',
    description:
      'Internal time tracking and project allocation platform. Current flagship project.',
    estimatedHours: 2400,
    color: '#2563EB',
    projectStatus: 'ACTIVE',
    projectPriority: 'HIGH',
    startDate: '2026-01-12',
    endDate: null,
    isArchived: false,
  },
  {
    code: 'PORTAL',
    name: 'Internal Portal',
    clientName: 'Internal',
    description:
      'Company intranet: announcements, document library and employee directory.',
    estimatedHours: 960,
    color: '#7C3AED',
    // Paused, not shut down — and not archived either, so it still shows up in
    // a default listing. `ON_HOLD` is the whole answer; there is no second
    // column that could disagree with it.
    projectStatus: 'ON_HOLD',
    projectPriority: 'LOW',
    startDate: '2025-03-03',
    endDate: null,
    isArchived: false,
  },
  {
    code: 'ERP-INT',
    name: 'ERP Integration',
    clientName: 'Nordwind Logistics SRL',
    description:
      'Synchronises invoicing and stock data between the ERP and the internal systems.',
    estimatedHours: 1800,
    color: '#059669',
    projectStatus: 'COMPLETED',
    projectPriority: 'MEDIUM',
    startDate: '2025-09-01',
    endDate: '2026-06-30',
    isArchived: false,
  },
  {
    code: 'WEBSITE',
    name: 'Company Website',
    clientName: 'Aurora Retail Group',
    description:
      'Public marketing website and careers section. Delivered and handed over.',
    estimatedHours: 320,
    color: '#DB2777',
    projectStatus: 'COMPLETED',
    projectPriority: 'LOW',
    startDate: '2024-05-06',
    endDate: '2024-11-29',
    isArchived: true,
  },
  {
    code: 'SUPPORT',
    name: 'Support Platform',
    clientName: 'Helvetia Insurance AG',
    description:
      'Ticketing and SLA tracking for customer support and maintenance contracts.',
    estimatedHours: 1200,
    color: '#EA580C',
    projectStatus: 'ACTIVE',
    projectPriority: 'HIGH',
    startDate: '2026-04-01',
    endDate: null,
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
