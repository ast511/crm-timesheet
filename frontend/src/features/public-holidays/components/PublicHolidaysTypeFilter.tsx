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

export interface PublicHolidaysTypeFilterProps {
  /** `'FIXED'`, `'VARIABLE'`, or `undefined` for no filter. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

/**
 * `?type=` — the first of the two column filters this screen renders into the
 * toolbar.
 *
 * `DataTable` takes filters as a slot rather than as configuration, because
 * every list endpoint accepts a different set and the shared component cannot
 * know any of them. This is that slot: the control belongs to the screen, while
 * the *value* it writes goes through `actions.setFilter` into `state.filters` —
 * and therefore into the query key — like every other control.
 *
 * It earns its place in a way the leave-type booleans did not. The two types
 * are read differently, sort differently and answer to different rules, so
 * "show me only the recurring ones" is a question somebody genuinely asks of
 * this list — and a company that has entered a decade of variable holidays has
 * a list where the fixed ones are genuinely hard to find.
 *
 * "All" is a real option rather than a cleared select, so removing the filter
 * is one click in the same place that applied it.
 */
export const PublicHolidaysTypeFilter = ({ value, onChange }: PublicHolidaysTypeFilterProps) => {
  const { t } = useTranslation();

  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === null || next === ALL ? undefined : next)}
    >
      <SelectTrigger size="sm" aria-label={t('publicHolidays.filters.type')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t('publicHolidays.filters.allTypes')}</SelectItem>
        <SelectItem value="FIXED">{t('publicHolidays.filters.fixedOnly')}</SelectItem>
        <SelectItem value="VARIABLE">{t('publicHolidays.filters.variableOnly')}</SelectItem>
      </SelectContent>
    </Select>
  );
};
