import { useTranslation } from 'react-i18next';

import { useCan } from '@/features/permissions/usePermissions';

import { LeaveNotificationEmailForm } from './LeaveNotificationEmailForm';

/**
 * "Add an address" — the inline form at the top of the section.
 *
 * It is a permanent inline form rather than a button that opens a dialog, and
 * that is the one place this section deliberately differs from the leave-types
 * table above it. A leave type is twelve fields and needs a modal; an address is
 * **one**, and putting one input behind a button, a portal and a dismissal is
 * more ceremony than the thing it collects. It also makes the section's purpose
 * legible at a glance: the field is labelled, so what the list holds is obvious
 * before anything is clicked.
 *
 * Because the form is always there, the empty state below needs no call to
 * action of its own — the affordance is already on screen, immediately above it.
 *
 * Gated on `LEAVES.CONFIGURE` — **not** `LEAVES.CREATE`, which is what the
 * leave-types create button beside it on this page carries, and the difference
 * is the catalog's rather than a preference. The seed describes
 * `LEAVES.CONFIGURE` as changing "the rules balances are judged by — carry-over,
 * approval requirements, **notification addresses** — and running the year-end
 * generation": this list is named there and under no other key.
 *
 * So the two halves of one screen ask for two different permissions, on purpose.
 * Adding a leave type is day-to-day HR work; deciding who is *emailed* about
 * leave is a routing decision about the company, and `HR - Standard` may do the
 * first and not the second. Backend Feature 041 gates
 * `POST /leave-notification-emails` on the same key, which is what keeps this
 * form from rendering a button the API would refuse.
 *
 * Somebody without it sees the list and no way to add to it, which is correct:
 * they can read the configuration and filling it in is not their job.
 */
export const LeaveNotificationEmailAddForm = () => {
  const { t } = useTranslation();
  const canCreate = useCan({ permission: 'LEAVES.CONFIGURE' });

  if (!canCreate) return null;

  return (
    <div className="flex flex-col gap-3 border-b pb-4">
      <p className="text-sm font-medium">{t('leaveNotificationEmails.actions.addTitle')}</p>
      <LeaveNotificationEmailForm />
    </div>
  );
};
