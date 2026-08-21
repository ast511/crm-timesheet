import { PalmtreeIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PublicHolidayCreateButton } from './PublicHolidayCreateButton';

/**
 * What the screen says when the company has configured no holidays at all.
 *
 * It replaces the whole table rather than showing an empty one, and the
 * distinction it draws is the one that matters: **nothing here yet** is not *no
 * results for what you asked*. A search or a filter that matches nothing keeps
 * the toolbar and the table and says so inside it — the term is still in the
 * box, the filter is still set, and clearing either is the obvious next move.
 * An unconfigured list has nothing to clear and no rows to page through, so a
 * toolbar over an empty table would offer controls for data that does not
 * exist.
 *
 * The only thing to do here is add the first one, so the call to action is the
 * content. For somebody without `PUBLIC_HOLIDAYS.CREATE` the button renders
 * nothing and the explanation stands on its own — which is correct: they can
 * see that the calendar is empty and that filling it is not their job.
 *
 * The icon is the one the sidebar already uses for holidays, so the empty
 * screen and the menu item that led to it are recognisably the same subject.
 */
export const PublicHolidaysEmptyState = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <PalmtreeIcon className="size-6" />
      </span>

      <div className="flex flex-col gap-1">
        <h2 className="font-medium">{t('publicHolidays.empty.title')}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          {t('publicHolidays.empty.description')}
        </p>
      </div>

      <PublicHolidayCreateButton />
    </div>
  );
};
