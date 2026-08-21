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

export interface PublicHolidaysScopeFilterProps {
  /** `'true'`, `'false'`, or `undefined` for no filter. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

/**
 * `?isNational=` — the second column filter, and the one an audit asks for.
 *
 * The distinction it draws is between the law and this company's own policy:
 * the national days are fixed by statute and are the same everywhere, while the
 * rest are days this company decided to close. Separating them is how somebody
 * checks the statutory calendar against the official list without reading past
 * the company's own additions, which is the one review this screen exists to
 * support.
 *
 * The value is carried as the string a `<Select>` produces and turned into a
 * boolean once, in `toPublicHolidaysQuery` — the endpoint validates
 * `?isNational=` strictly, so `'true'` and `true` must not both be spellings
 * that leave this application.
 */
export const PublicHolidaysScopeFilter = ({
  value,
  onChange,
}: PublicHolidaysScopeFilterProps) => {
  const { t } = useTranslation();

  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === null || next === ALL ? undefined : next)}
    >
      <SelectTrigger size="sm" aria-label={t('publicHolidays.filters.scope')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t('publicHolidays.filters.allScopes')}</SelectItem>
        <SelectItem value="true">{t('publicHolidays.filters.nationalOnly')}</SelectItem>
        <SelectItem value="false">{t('publicHolidays.filters.companyOnly')}</SelectItem>
      </SelectContent>
    </Select>
  );
};
