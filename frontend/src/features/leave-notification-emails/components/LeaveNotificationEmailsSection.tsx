import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { QueryBoundary } from '@/components/QueryBoundary';
import { Card, CardContent } from '@/components/ui/card';

import { LeaveNotificationEmailAddForm } from './LeaveNotificationEmailAddForm';
import { LeaveNotificationEmailsList } from './LeaveNotificationEmailsList';
import { LeaveNotificationEmailsSkeleton } from './LeaveNotificationEmailsSkeleton';

/**
 * "Adrese de notificare pentru cereri" — the whole section, ready to be dropped
 * onto a page.
 *
 * It is composed here rather than in `LeaveTypesPage` so the page adds one line
 * and knows nothing about how the addresses are fetched, paged or written. That
 * is also what would let the section move — to a leave-settings page of its own,
 * should the configuration ever outgrow this one — without touching anything
 * inside it.
 *
 * ## It must not read as part of the table above it
 *
 * Three things keep the two apart, and all three are needed: a rule and a wide
 * top margin, so there is a visible break rather than a gap; its own `<h2>` and
 * description, so the reader is told this is a different subject rather than
 * left to infer it; and its own `Card`, so the addresses sit on their own
 * surface instead of continuing the leave types' one. The heading is an `<h2>`
 * under the page's `<h1>` — the outline says "Leave types → notification
 * addresses", which is what the page actually is.
 *
 * ## The heading is outside the boundary, the list is inside it
 *
 * The same arrangement the page uses for its table: the heading and the add form
 * state facts that do not depend on the response — this is the addresses
 * section, and adding one needs nothing loaded — so they render immediately and
 * stay put while the list suspends into a skeleton shaped like itself. A failed
 * fetch renders `QueryErrorState` inside the card, so the section fails visibly
 * on its own without taking the leave types down with it.
 */
export const LeaveNotificationEmailsSection = () => {
  const { t } = useTranslation();
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="mt-2 flex flex-col gap-4 border-t pt-8">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-lg font-semibold tracking-tight">
          {t('leaveNotificationEmails.title')}
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          {t('leaveNotificationEmails.description')}
        </p>
      </div>

      <Card>
        <CardContent className="gap-4">
          <LeaveNotificationEmailAddForm />

          <QueryBoundary fallback={<LeaveNotificationEmailsSkeleton />}>
            <LeaveNotificationEmailsList />
          </QueryBoundary>
        </CardContent>
      </Card>
    </section>
  );
};
