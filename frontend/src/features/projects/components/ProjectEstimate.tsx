import { useTranslation } from 'react-i18next';

import type { Project } from '../projects-api';

export type ProjectEstimateProps = Pick<Project, 'estimatedHours'>;

/**
 * The *Ore estimate* column, and the one number on this screen that means
 * something other than itself when it is zero.
 *
 * `estimatedHours` is a required, non-nullable integer, so there is no `null`
 * to print a dash for — the column carries a `@default(0)` and the API asks for
 * the number outright. **`0` is how this contract spells "not estimated yet"**,
 * which the backend says in as many words, so printing `0 h` would state a
 * budget of nothing where none has been set. It reads *Neestimat* instead, in
 * the muted tone the sibling screens use for a value that is absent rather than
 * small.
 *
 * `tabular-nums` so a column of estimates aligns on its digits, which is the
 * whole reason a number column is worth sorting.
 */
export const ProjectEstimate = ({ estimatedHours }: ProjectEstimateProps) => {
  const { t } = useTranslation();

  if (estimatedHours === 0) {
    return <span className="text-muted-foreground">{t('projects.columns.notEstimated')}</span>;
  }

  return (
    <span className="tabular-nums whitespace-nowrap">
      {t('projects.columns.hours', { hours: estimatedHours })}
    </span>
  );
};
