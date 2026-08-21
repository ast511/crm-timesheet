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
 * Gated on `LEAVES.CREATE`, the same key the leave-types create button carries
 * on this page. Somebody without it sees the list and no way to add to it, which
 * is correct: they can read the configuration and filling it in is not their
 * job.
 */
export const LeaveNotificationEmailAddForm = () => {
  const { t } = useTranslation();
  const canCreate = useCan({ permission: 'LEAVES.CREATE' });

  if (!canCreate) return null;

  return (
    <div className="flex flex-col gap-3 border-b pb-4">
      <p className="text-sm font-medium">{t('leaveNotificationEmails.actions.addTitle')}</p>
      <LeaveNotificationEmailForm />
    </div>
  );
};
