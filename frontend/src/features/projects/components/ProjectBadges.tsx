import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import type { CommonKey } from '@/i18n/keys';

import type { ProjectPriority, ProjectStatus } from '../projects-api';

/**
 * The badge cells of the projects table.
 *
 * Each one prints a word as well as an emphasis, so nothing depends on colour
 * alone — a rule `CLAUDE.md` states directly, and one that matters more on this
 * screen than on its siblings, since a row also carries a *free* colour the
 * person picked. Every variant comes from theme tokens, so the badges follow
 * the account's palette rather than fixed colours, and the same variants mean
 * the same things they do on the three settings screens before this one.
 *
 * ## Why the labels are looked up through a map
 *
 * `Record<ProjectStatus, CommonKey>` rather than a chain of ternaries: a status
 * added to the contract is then a **compile error here**, at the one place that
 * has to name it, instead of a row rendering the raw `ON_HOLD` from the API.
 * The same guarantee `PROJECT_STATUS_ORDER` gives the select and the filter,
 * and the reason neither list is written out twice.
 */

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'muted' | 'destructive';

const STATUS_LABEL_KEYS = {
  ACTIVE: 'projects.status.active',
  ON_HOLD: 'projects.status.onHold',
  COMPLETED: 'projects.status.completed',
  CANCELLED: 'projects.status.cancelled',
} as const satisfies Record<ProjectStatus, CommonKey>;

/**
 * Emphasis follows attention, not severity.
 *
 * `ACTIVE` is the work happening now and carries the primary emphasis;
 * `ON_HOLD` is paused and outlined; `COMPLETED` is done and recedes into muted;
 * `CANCELLED` is the one that stopped without finishing, which is the state
 * somebody looking at a list of hours needs to notice, so it takes the
 * destructive tone. None of it is the only signal — the word is in the badge.
 */
const STATUS_VARIANTS = {
  ACTIVE: 'default',
  ON_HOLD: 'outline',
  COMPLETED: 'muted',
  CANCELLED: 'destructive',
} as const satisfies Record<ProjectStatus, BadgeVariant>;

export interface ProjectStatusBadgeProps {
  status: ProjectStatus;
}

/** Where the project is in its life: active, paused, finished or stopped. */
export const ProjectStatusBadge = ({ status }: ProjectStatusBadgeProps) => {
  const { t } = useTranslation();

  return <Badge variant={STATUS_VARIANTS[status]}>{t(STATUS_LABEL_KEYS[status])}</Badge>;
};

const PRIORITY_LABEL_KEYS = {
  LOW: 'projects.priority.low',
  MEDIUM: 'projects.priority.medium',
  HIGH: 'projects.priority.high',
} as const satisfies Record<ProjectPriority, CommonKey>;

/**
 * `MEDIUM` is the default every project starts at, so it is the quiet one — a
 * list where most rows are medium should not be a wall of emphasis. `HIGH` and
 * `LOW` are the deliberate choices and are the ones that stand out.
 */
const PRIORITY_VARIANTS = {
  LOW: 'outline',
  MEDIUM: 'muted',
  HIGH: 'secondary',
} as const satisfies Record<ProjectPriority, BadgeVariant>;

export interface ProjectPriorityBadgeProps {
  priority: ProjectPriority;
}

/** How this project ranks against the others when time has to be chosen. */
export const ProjectPriorityBadge = ({ priority }: ProjectPriorityBadgeProps) => {
  const { t } = useTranslation();

  return <Badge variant={PRIORITY_VARIANTS[priority]}>{t(PRIORITY_LABEL_KEYS[priority])}</Badge>;
};

export interface ProjectArchivedBadgeProps {
  isArchived: boolean;
}

/**
 * *Arhivat*, and **only** when it is true — the one badge on this screen that
 * prints a single state rather than both.
 *
 * The sibling screens print both sides of a flag because an empty cell in a
 * column headed *Stare* is ambiguous: not active, or not loaded? This is not a
 * column. It rides beside the project's name, marking the exception, and the
 * ordinary case is simply a project that is not archived — a badge saying
 * "Neaarhivat" on nearly every row would be noise carrying no information.
 *
 * Archived is also not the same fact as `COMPLETED`, which is why it is a badge
 * of its own rather than a fifth status: the status says what happened to the
 * work, and this says whether the project is still offered for new hours. A
 * cancelled project can stay unarchived while its last timesheets are filed,
 * and a completed one is usually archived some time after it completes.
 */
export const ProjectArchivedBadge = ({ isArchived }: ProjectArchivedBadgeProps) => {
  const { t } = useTranslation();

  if (!isArchived) return null;

  return <Badge variant="outline">{t('projects.flags.archived')}</Badge>;
};
