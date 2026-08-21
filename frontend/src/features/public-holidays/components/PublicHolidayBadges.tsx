import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';

import type { HolidayType, PublicHoliday } from '../public-holidays-api';

/**
 * The badge columns of the holidays table.
 *
 * Each one prints **both** states rather than showing a badge for one case and
 * an empty cell for the other. An empty cell is ambiguous — not national, or
 * not loaded, or a column that does not apply — and every badge carries the
 * word as well as the emphasis, so nothing depends on colour alone. Both are
 * rules `CLAUDE.md` states directly, and both variants come from theme tokens
 * so the badges follow the account's palette.
 *
 * The same variants as `LeaveTypeActiveBadge` and `DepartmentActiveBadge`,
 * which is what makes a badge mean the same thing, and look the same, on all
 * three settings screens.
 */

export interface PublicHolidayTypeBadgeProps {
  type: HolidayType;
}

/**
 * `FIXED` / `VARIABLE` — the field the rest of the row is read against.
 *
 * It decides whether the year in the date means anything and whether the
 * validity range applies, so it is the first badge rather than a detail: a
 * reader who has not registered the type will misread the two columns beside
 * it.
 */
export const PublicHolidayTypeBadge = ({ type }: PublicHolidayTypeBadgeProps) => {
  const { t } = useTranslation();

  return (
    <Badge variant={type === 'FIXED' ? 'secondary' : 'outline'}>
      {type === 'FIXED' ? t('publicHolidays.flags.fixed') : t('publicHolidays.flags.variable')}
    </Badge>
  );
};

export interface PublicHolidayScopeBadgeProps {
  isNational: boolean;
}

/**
 * National, or the company's own.
 *
 * A statutory day off and a day this company chose to close are both holidays
 * and are not the same fact — one is the law and the other is policy — so the
 * false case gets a word of its own rather than a blank.
 */
export const PublicHolidayScopeBadge = ({ isNational }: PublicHolidayScopeBadgeProps) => {
  const { t } = useTranslation();

  return (
    <Badge variant={isNational ? 'default' : 'muted'}>
      {isNational ? t('publicHolidays.flags.national') : t('publicHolidays.flags.company')}
    </Badge>
  );
};

export type PublicHolidayValidityProps = Pick<
  PublicHoliday,
  'type' | 'validFromYear' | 'validToYear'
>;

/**
 * The years a recurring holiday applies to — four cases, and the empty one is
 * not an absence.
 *
 * Both ends are optional and each means "open at this end": a holiday with
 * neither has always applied and still does, which is what entering a holiday
 * normally means and is why it reads *Permanent* rather than as a blank cell. A
 * `validToYear` is how a holiday is repealed without deleting the reason a past
 * year had that day off, so `2001 – 2015` and `din 2020` are both ordinary
 * rows, not edge cases.
 *
 * **On a `VARIABLE` holiday there is nothing to show, and that is the contract
 * rather than missing data.** Such a row already *is* one year — the year in
 * its `startDate` — so the backend rejects a range on it outright. The dash
 * says the column does not apply to this row, which is exactly what it means.
 */
export const PublicHolidayValidity = ({
  type,
  validFromYear,
  validToYear,
}: PublicHolidayValidityProps) => {
  const { t } = useTranslation();

  if (type === 'VARIABLE') {
    return <span className="text-muted-foreground">{t('publicHolidays.columns.noValue')}</span>;
  }

  if (validFromYear === null && validToYear === null) {
    return <Badge variant="muted">{t('publicHolidays.validity.always')}</Badge>;
  }

  if (validToYear === null) {
    return <Badge variant="outline">{t('publicHolidays.validity.from', { year: validFromYear })}</Badge>;
  }

  if (validFromYear === null) {
    return <Badge variant="outline">{t('publicHolidays.validity.until', { year: validToYear })}</Badge>;
  }

  return (
    <Badge variant="outline">
      {t('publicHolidays.validity.range', { from: validFromYear, to: validToYear })}
    </Badge>
  );
};
