import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';

export interface DepartmentActiveBadgeProps {
  isActive: boolean;
}

/**
 * The `isActive` column, rendered as a badge rather than as `true` / `false`.
 *
 * It prints **both** states rather than showing a badge for the active case and
 * an empty cell for the inactive one. An empty cell is ambiguous — retired, or
 * not loaded, or a column that does not apply — and the badge carries the word
 * as well as the emphasis, so nothing depends on colour alone. Both are rules
 * `CLAUDE.md` states directly, and both variants come from theme tokens so the
 * badge follows the account's palette.
 *
 * The same component and the same two variants as `LeaveTypeActiveBadge`, which
 * is what makes "Activ" mean the same thing, and look the same, on both settings
 * screens.
 */
export const DepartmentActiveBadge = ({ isActive }: DepartmentActiveBadgeProps) => {
  const { t } = useTranslation();

  return (
    <Badge variant={isActive ? 'default' : 'muted'}>
      {isActive ? t('departments.flags.active') : t('departments.flags.inactive')}
    </Badge>
  );
};
