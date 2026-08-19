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

export interface LeaveTypesActiveFilterProps {
  /** `'true'`, `'false'`, or `undefined` for no filter. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

/**
 * `?isActive=` — the one column filter this screen renders into the toolbar.
 *
 * `DataTable` takes filters as a slot rather than as configuration, because
 * every list endpoint accepts a different set and the shared component cannot
 * know any of them. This is that slot for leave types: the control belongs to
 * the screen, while the *value* it writes goes through `actions.setFilter` into
 * `state.filters` — and therefore into the query key — like every other control.
 *
 * The endpoint also accepts `?isPaid=` and `?requiresApproval=`. Neither is
 * offered here: both columns are visible on every row and a list of leave types
 * is short enough to read, so a filter for them would be a control that saves
 * nobody a scroll. Retired types are the one case where the list genuinely
 * hides what somebody is looking for, which is why `isActive` is here alone.
 *
 * "All" is a real option rather than a cleared select, so removing the filter is
 * one click in the same place that applied it.
 */
export const LeaveTypesActiveFilter = ({ value, onChange }: LeaveTypesActiveFilterProps) => {
  const { t } = useTranslation();

  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === null || next === ALL ? undefined : next)}
    >
      <SelectTrigger size="sm" aria-label={t('leaveTypes.filters.status')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t('leaveTypes.filters.all')}</SelectItem>
        <SelectItem value="true">{t('leaveTypes.filters.activeOnly')}</SelectItem>
        <SelectItem value="false">{t('leaveTypes.filters.inactiveOnly')}</SelectItem>
      </SelectContent>
    </Select>
  );
};