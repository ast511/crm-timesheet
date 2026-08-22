import { XIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';

import type { TimesheetApprovalEmail } from '../work-schedule-api';
import { DeleteTimesheetApprovalEmailDialog } from './DeleteTimesheetApprovalEmailDialog';

export interface TimesheetApprovalEmailChipProps {
  approvalEmail: TimesheetApprovalEmail;
  /** True for somebody holding `WORK_SCHEDULE.CONFIGURE`. */
  canRemove: boolean;
}

/**
 * One address, as the mock's chip.
 *
 * ## The `×` is a real button with a real name
 *
 * It is icon-only, so `aria-label` carries what it does *and which address it
 * does it to* — "Elimină hr@firma.ro". Seven identical "Remove" buttons in a row
 * are seven buttons a screen-reader user has to leave the list to tell apart.
 *
 * It is inside the `Badge` visually and a sibling of the text semantically: the
 * badge is a `<span>`, so nothing here nests interactive content inside
 * interactive content.
 *
 * ## Without the permission the chip loses its button, not its text
 *
 * `WORK_SCHEDULE.CONFIGURE` is what the backend asks for on `DELETE`, so
 * somebody without it gets a plain chip. The address stays readable — knowing
 * where timesheets go is worth having for anybody who may see this page — and
 * nothing on screen offers an action the API would refuse.
 */
export const TimesheetApprovalEmailChip = ({
  approvalEmail,
  canRemove,
}: TimesheetApprovalEmailChipProps) => {
  const { t } = useTranslation();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  return (
    <>
      <Badge variant="secondary" className="gap-1.5 py-1.5 pr-1.5 pl-3 text-sm">
        <span className="break-all">{approvalEmail.email}</span>

        {canRemove && (
          <button
            type="button"
            aria-label={t('workSchedule.emails.actions.remove', {
              email: approvalEmail.email,
            })}
            onClick={() => setIsDeleteOpen(true)}
            className="rounded-sm p-0.5 transition-colors hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <XIcon className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </Badge>

      {/*
       * Mounted only while it is open, so the confirmation is not one of N
       * dialogs sitting in the tree for a list of addresses — and so its
       * mutation state starts clean on every open.
       */}
      {isDeleteOpen && (
        <DeleteTimesheetApprovalEmailDialog
          open={isDeleteOpen}
          onOpenChange={setIsDeleteOpen}
          approvalEmail={approvalEmail}
        />
      )}
    </>
  );
};
