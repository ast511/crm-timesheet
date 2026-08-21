import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeftIcon, ChevronRightIcon, MailIcon } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import type { LeaveNotificationEmail } from '../leave-notification-emails-api';
import { useSuspenseLeaveNotificationEmails } from '../useLeaveNotificationEmails';
import { LeaveNotificationEmailRowActions } from './LeaveNotificationEmailRowActions';
import { LeaveNotificationEmailsEmptyState } from './LeaveNotificationEmailsEmptyState';

const FIRST_PAGE = 1;

/**
 * The configured addresses — **a plain list, not the shared `DataTable`**, and
 * that is the one design decision this component is really about.
 *
 * `CLAUDE.md` makes the server-side `DataTable` the default for any list that
 * can grow, and adds the exemption this uses: *"if a table is genuinely tiny and
 * fixed (e.g. a short config list)"*. A row here is **one value** — an address —
 * so a table would be a single column carrying a search box, a sort menu, a
 * column-visibility menu with nothing to hide, a page-size selector and a
 * responsive table→cards switch, all to render text that already fits on a
 * phone. The controls would outweigh the data, on a section that sits under
 * somebody else's table.
 *
 * What is *not* dropped is the server. The endpoint is paginated and this list
 * pages against it — `page` goes into the query key, so page 2 is a request and
 * a cache entry of its own rather than a slice of rows held in the browser. The
 * pager only appears when there is a second page, which for most companies is
 * never.
 *
 * Two things are deliberately not offered: `?search=` and `?sortBy=`. The list
 * is alphabetical by `email`, which is the backend's own default and the order a
 * person reads addresses in, and a search box over a handful of them would save
 * nobody a scroll. Both are one argument away in `toLeaveNotificationEmailsQuery`
 * if the list ever grows.
 */
export const LeaveNotificationEmailsList = () => {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const [page, setPage] = useState(FIRST_PAGE);

  /*
   * Paging is a transition for the reason `useDataTableTransition` exists:
   * `page` is in the query key, so without it every click would suspend the
   * section back to its skeleton — a placeholder flashing on every interaction,
   * which is worse than the wait it covers. The first load still suspends,
   * which is correct: there is nothing yet to keep.
   */
  const [isPending, startTransition] = useTransition();
  const goToPage = (next: number) => startTransition(() => setPage(next));

  const { items, meta } = useSuspenseLeaveNotificationEmails(page);

  /*
   * Removing the only row on page 2 leaves the list standing on a page the
   * result set no longer has. The backend answers that with an empty page
   * rather than an error, so the list steps back one instead.
   */
  const onDeleted = () => {
    if (items.length === 1 && page > FIRST_PAGE) goToPage(page - 1);
  };

  if (meta.total === 0) return <LeaveNotificationEmailsEmptyState />;

  const duration = prefersReducedMotion === true ? 0 : 0.18;

  return (
    <div className="flex flex-col gap-3" aria-busy={isPending}>
      <ul className="flex flex-col divide-y" aria-label={t('leaveNotificationEmails.listLabel')}>
        <AnimatePresence initial={false}>
          {items.map((notificationEmail: LeaveNotificationEmail) => (
            <motion.li
              key={notificationEmail.id}
              layout={prefersReducedMotion !== true}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <MailIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 break-all text-sm">{notificationEmail.email}</span>
                </div>

                <LeaveNotificationEmailRowActions
                  notificationEmail={notificationEmail}
                  onDeleted={onDeleted}
                />
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {/*
       * A page that came back empty while the collection is not — somebody else
       * removed the rows this page held. The pager below is the way back.
       */}
      {items.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">{t('table.noResults')}</p>
      )}

      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            {isPending && <Spinner size="sm" />}
            {t('table.totalRecords', { total: meta.total })} ·{' '}
            {t('table.pageOf', { page: meta.page, totalPages: meta.totalPages })}
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t('table.previousPage')}
              disabled={!meta.hasPreviousPage}
              onClick={() => goToPage(meta.page - 1)}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t('table.nextPage')}
              disabled={!meta.hasNextPage}
              onClick={() => goToPage(meta.page + 1)}
            >
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
