import { useTranslation } from 'react-i18next';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CommonKey } from '@/i18n/keys';

import { PROJECT_PRIORITY_OPTIONS, type ProjectPriority } from '../projects-api';

/** The value that means "do not send the filter at all". */
const ALL = 'all';

const PRIORITY_LABEL_KEYS = {
  LOW: 'projects.priority.low',
  MEDIUM: 'projects.priority.medium',
  HIGH: 'projects.priority.high',
} as const satisfies Record<ProjectPriority, CommonKey>;

export interface ProjectsPriorityFilterProps {
  /** One of the three priorities, or `undefined` for no filter. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

/**
 * `?projectPriority=` — the second column filter, on the same terms as the
 * first.
 *
 * Priority is filterable and not sortable for the same reason status is: a
 * three-valued column groups rather than sorts, and the backend's `sortBy` enum
 * agrees by omitting both. "Show me the high-priority work" is the question,
 * and a filter is what answers it.
 *
 * Options come from `PROJECT_PRIORITY_OPTIONS`, low to high — the same list the
 * form's select and the Zod enum use.
 */
export const ProjectsPriorityFilter = ({ value, onChange }: ProjectsPriorityFilterProps) => {
  const { t } = useTranslation();

  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === null || next === ALL ? undefined : next)}
    >
      <SelectTrigger size="sm" aria-label={t('projects.filters.priority')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t('projects.filters.allPriorities')}</SelectItem>
        {PROJECT_PRIORITY_OPTIONS.map((priority) => (
          <SelectItem key={priority} value={priority}>
            {t(PRIORITY_LABEL_KEYS[priority])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
