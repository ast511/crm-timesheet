import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { WEEKDAYS, type Weekday } from './work-schedule-api';

export interface WeekdayOption {
  value: Weekday;
  /** `Luni` — the accessible name, and the visible one from `sm` upwards. */
  label: string;
  /** `Lu` — the two letters the toggle shows at every width. */
  short: string;
}

/**
 * The seven weekdays, named, in week order.
 *
 * One list feeds three controls — the toggles, the `weekStartsOn` select and the
 * "Monday to Friday" preset — so they cannot disagree about what a Wednesday is
 * called or where it sits in the week.
 *
 * **The names come from the bundles, not from `Intl`.** A locale-derived name
 * would be a fourth source of Romanian in an application whose other strings all
 * live in `locales/`, and `Intl`'s Romanian weekday abbreviations are three
 * letters (`lun.`) where this design needs two. Deriving them would also make
 * the labels depend on the browser's locale data rather than on the language the
 * person actually chose in the switcher.
 */
export const useWeekdayOptions = (): WeekdayOption[] => {
  const { t } = useTranslation();

  return useMemo(
    () =>
      WEEKDAYS.map((value) => ({
        value,
        label: t(`workSchedule.weekdays.long.${value}`),
        short: t(`workSchedule.weekdays.short.${value}`),
      })),
    [t],
  );
};
