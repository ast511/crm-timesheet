import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

import { useCan } from '@/features/permissions/usePermissions';

import { useSuspenseTimesheetApprovalEmails } from '../useTimesheetApprovalEmails';
import { TimesheetApprovalEmailChip } from './TimesheetApprovalEmailChip';

/**
 * The configured addresses, as a wrapping row of chips.
 *
 * **Not the shared `DataTable`, and not even F10's row list.** `CLAUDE.md` makes
 * the server-side `DataTable` the default for any list that can grow and adds
 * the exemption this uses: *"if a table is genuinely tiny and fixed (e.g. a
 * short config list)"*. A row here is one address; the endpoint is explicitly
 * unpaginated because the collection is bounded by a configured maximum rather
 * than by a page size. So there is no pager, no search, no sort and no
 * column-visibility menu — every one of them a control that would outweigh what
 * it controlled.
 *
 * Chips rather than F10's stacked rows because that is what the mock draws, and
 * it suits the data: three or four short strings read as a set at a glance,
 * where a full-width row each would make a list of four look like a list of
 * forty. They wrap, so the section grows downwards on a phone instead of
 * scrolling sideways.
 *
 * Rows animate in and out with `AnimatePresence`, honouring
 * `prefers-reduced-motion` by collapsing the duration to zero — the shared rule
 * from `FadeIn` and `FormAlert`.
 */
export const TimesheetApprovalEmailsList = () => {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const approvalEmails = useSuspenseTimesheetApprovalEmails();
  const canConfigure = useCan({ permission: 'WORK_SCHEDULE.CONFIGURE' });

  const duration = prefersReducedMotion === true ? 0 : 0.18;

  if (approvalEmails.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {canConfigure
          ? t('workSchedule.emails.empty.description')
          : t('workSchedule.emails.empty.readOnlyDescription')}
      </p>
    );
  }

  return (
    <ul aria-label={t('workSchedule.emails.listLabel')} className="flex flex-wrap gap-2">
      <AnimatePresence initial={false}>
        {approvalEmails.map((approvalEmail) => (
          <motion.li
            key={approvalEmail.id}
            layout={prefersReducedMotion === true ? false : 'position'}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration, ease: 'easeOut' }}
          >
            <TimesheetApprovalEmailChip
              approvalEmail={approvalEmail}
              canRemove={canConfigure}
            />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
};
