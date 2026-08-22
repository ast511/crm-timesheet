import { useTranslation } from 'react-i18next';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CommonKey } from '@/i18n/keys';

import { PROJECT_STATUS_OPTIONS, type ProjectStatus } from '../projects-api';

/** The value that means "do not send the filter at all". */
const ALL = 'all';

const STATUS_LABEL_KEYS = {
  ACTIVE: 'projects.status.active',
  ON_HOLD: 'projects.status.onHold',
  COMPLETED: 'projects.status.completed',
  CANCELLED: 'projects.status.cancelled',
} as const satisfies Record<ProjectStatus, CommonKey>;

export interface ProjectsStatusFilterProps {
  /** One of the four statuses, or `undefined` for no filter. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

/**
 * `?projectStatus=` — the first of the three column filters this screen renders
 * into the toolbar.
 *
 * `DataTable` takes filters as a slot rather than as configuration, because
 * every list endpoint accepts a different set and the shared component cannot
 * know any of them. This is that slot: the control belongs to the screen, while
 * the *value* it writes goes through `actions.setFilter` into `state.filters` —
 * and therefore into the query key — like every other control.
 *
 * It earns its place the way the holidays type filter did, and more clearly:
 * `projectStatus` is filterable on the API and deliberately **not sortable**,
 * because ordering a list by a four-valued column groups it rather than sorts
 * it. "Show me only what is on hold" is the question somebody actually has, and
 * this is the control that answers it.
 *
 * The options are `PROJECT_STATUS_OPTIONS`, in lifecycle order — the same list
 * the form's select and the Zod enum are built from, so a status added to the
 * contract appears in all three or in none.
 *
 * "All" is a real option rather than a cleared select, so removing the filter is
 * one click in the same place that applied it.
 */
export const ProjectsStatusFilter = ({ value, onChange }: ProjectsStatusFilterProps) => {
  const { t } = useTranslation();

  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === null || next === ALL ? undefined : next)}
    >
      <SelectTrigger size="sm" aria-label={t('projects.filters.status')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t('projects.filters.allStatuses')}</SelectItem>
        {PROJECT_STATUS_OPTIONS.map((status) => (
          <SelectItem key={status} value={status}>
            {t(STATUS_LABEL_KEYS[status])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
