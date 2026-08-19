import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';

/**
 * The boolean columns, rendered as badges rather than as `true` / `false`.
 *
 * Each one prints **both** states rather than showing a badge for the true case
 * and an empty cell for the false one. An empty cell is ambiguous — unpaid, or
 * not loaded, or a column that does not apply — and the whole point of these
 * columns is that a policy is legible at a glance. It is also the rule
 * `CLAUDE.md` states directly: colour never carries the meaning on its own, so
 * every badge holds the word as well as the emphasis.
 */

export interface LeaveTypeActiveBadgeProps {
  isActive: boolean;
}

export const LeaveTypeActiveBadge = ({ isActive }: LeaveTypeActiveBadgeProps) => {
  const { t } = useTranslation();

  return (
    <Badge variant={isActive ? 'default' : 'muted'}>
      {isActive ? t('leaveTypes.flags.active') : t('leaveTypes.flags.inactive')}
    </Badge>
  );
};

export interface LeaveTypePaidBadgeProps {
  isPaid: boolean;
}

export const LeaveTypePaidBadge = ({ isPaid }: LeaveTypePaidBadgeProps) => {
  const { t } = useTranslation();

  return (
    <Badge variant={isPaid ? 'secondary' : 'outline'}>
      {isPaid ? t('leaveTypes.flags.paid') : t('leaveTypes.flags.unpaid')}
    </Badge>
  );
};

export interface LeaveTypeApprovalBadgeProps {
  requiresApproval: boolean;
}

export const LeaveTypeApprovalBadge = ({ requiresApproval }: LeaveTypeApprovalBadgeProps) => {
  const { t } = useTranslation();

  return (
    <Badge variant={requiresApproval ? 'secondary' : 'outline'}>
      {requiresApproval
        ? t('leaveTypes.flags.requiresApproval')
        : t('leaveTypes.flags.noApproval')}
    </Badge>
  );
};

export interface LeaveTypeCarryOverProps {
  allowsCarryOver: boolean;
  /** The ceiling on what survives a year-end; `null` means no ceiling. */
  maxCarryOverDays: number | null;
}

/**
 * Carry-over, which is two facts and needs both.
 *
 * "Yes" alone would hide the ceiling, and a ceiling alone would not say whether
 * it applies. `null` is *no* ceiling rather than a ceiling of zero — a
 * distinction the backend is explicit about — so it is spelled out in words
 * instead of shown as a blank.
 */
export const LeaveTypeCarryOver = ({
  allowsCarryOver,
  maxCarryOverDays,
}: LeaveTypeCarryOverProps) => {
  const { t } = useTranslation();

  if (!allowsCarryOver) {
    return <Badge variant="outline">{t('leaveTypes.flags.noCarryOver')}</Badge>;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge variant="secondary">{t('leaveTypes.flags.carryOver')}</Badge>
      <span className="text-xs text-muted-foreground">
        {maxCarryOverDays === null
          ? t('leaveTypes.flags.carryOverUnlimited')
          : t('leaveTypes.flags.carryOverMax', { days: maxCarryOverDays })}
      </span>
    </span>
  );
};