import { MailPlusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useCan } from '@/features/permissions/usePermissions';

/**
 * What the section says when no address has been configured.
 *
 * There is no button here, and its absence is the point: the add form is
 * permanently on screen immediately above, so a call to action would point at
 * something already visible. The two sentences differ by permission instead —
 * somebody who may add one is told to use the field above, and somebody who may
 * not is told what the list is for and left to read it, which is correct: they
 * can see the list is empty and that filling it is not their job.
 *
 * There is only one kind of "nothing" to distinguish here, unlike the table
 * above: this list has no search and no filter, so an empty result can only mean
 * an unconfigured list. A failed fetch is a different thing again and lands in
 * `QueryErrorState`, one boundary out — a thrown query cannot render as an
 * empty list.
 *
 * The key is `LEAVES.CONFIGURE`, the same one the add form above uses and for
 * the reason recorded there. It has to be the same key: this component decides
 * which of two sentences to show, and "use the field above" is a lie told to
 * anybody for whom that field did not render.
 */
export const LeaveNotificationEmailsEmptyState = () => {
  const { t } = useTranslation();
  const canCreate = useCan({ permission: 'LEAVES.CONFIGURE' });

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-8 text-center">
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <MailPlusIcon className="size-5" />
      </span>

      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{t('leaveNotificationEmails.empty.title')}</h3>
        <p className="max-w-prose text-sm text-muted-foreground">
          {canCreate
            ? t('leaveNotificationEmails.empty.description')
            : t('leaveNotificationEmails.empty.readOnlyDescription')}
        </p>
      </div>
    </div>
  );
};
