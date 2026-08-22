import { useTranslation } from 'react-i18next';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** The value that means "do not send the filter at all". */
const ALL = 'all';

export interface ProjectsArchivedFilterProps {
  /** `'true'`, `'false'`, or `undefined` for no filter. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

/**
 * `?isArchived=` — the third column filter, and the one that hides rows rather
 * than grouping them.
 *
 * Archiving is how a project is retired without deleting the hours booked to
 * it, so an established company's list accumulates archived rows that are
 * correct, permanent and rarely what somebody is looking for. `Doar active`
 * (`isArchived=false`) is the view most work happens in, and `Doar arhivate` is
 * how an old project is found again.
 *
 * **The default is still "all", not "active only".** A filter applied without
 * being asked for is a list that quietly omits rows, and the failure it causes
 * — "the project is not there", when it is archived and the screen never said
 * so — is worse than one extra click. The archived rows are marked with a badge
 * beside their name, so what is in the list is legible without setting a
 * filter first.
 */
export const ProjectsArchivedFilter = ({ value, onChange }: ProjectsArchivedFilterProps) => {
  const { t } = useTranslation();

  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === null || next === ALL ? undefined : next)}
    >
      <SelectTrigger size="sm" aria-label={t('projects.filters.archived')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t('projects.filters.allProjects')}</SelectItem>
        <SelectItem value="false">{t('projects.filters.activeOnly')}</SelectItem>
        <SelectItem value="true">{t('projects.filters.archivedOnly')}</SelectItem>
      </SelectContent>
    </Select>
  );
};
