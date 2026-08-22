import { MailIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { QueryBoundary } from '@/components/QueryBoundary';
import { Can } from '@/features/permissions/Can';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { TimesheetApprovalEmailAddForm } from './TimesheetApprovalEmailAddForm';
import { TimesheetApprovalEmailsList } from './TimesheetApprovalEmailsList';
import { TimesheetApprovalEmailsSkeleton } from './TimesheetApprovalEmailsSkeleton';

export interface TimesheetApprovalEmailsSectionProps {
  /**
   * False before a first `PUT` has stored the schedule. The addresses hang off
   * the configuration by a required foreign key, so the API answers `404` for
   * the list and for any write until it exists.
   */
  isScheduleConfigured: boolean;
}

/**
 * "Adrese de email pentru aprobare timesheet-uri" — the third card.
 *
 * The same shape F10 built for the leave-notification addresses, against this
 * module's `/work-schedule/emails` endpoints, with two differences that follow
 * from the API rather than from taste: the list is **unpaginated**, so there is
 * no pager; and there is no `PATCH`, so a typo is fixed by removing and adding
 * rather than by an edit dialog this feature would have to invent an endpoint
 * for.
 *
 * ## The permission is `WORK_SCHEDULE.CONFIGURE`, not `.EDIT`
 *
 * Backend Feature 041 gated `POST` and `DELETE` here on `CONFIGURE` while gating
 * the `PUT` above on `EDIT`, and this card matches that exactly. The catalog's
 * own words draw the line: `EDIT` is "change the working days, hours and entry
 * limits"; `CONFIGURE` is "maintain the addresses notified when a timesheet
 * needs approval".
 *
 * The split is worth having rather than a quirk to paper over. `Admin -
 * Standard` holds `EDIT` and **not** `CONFIGURE` — one of nine cells the seed
 * deliberately withholds from that tier — so an ordinary administrator may
 * change the working week and may not reroute the approval mail to themselves.
 * That is an act whose consequences outlive the click. So one screen asks for
 * two permissions, on purpose, and an `Admin - Standard` account sees a form it
 * can save above a list it can only read.
 *
 * ## Nothing is fetched before the schedule exists
 *
 * `GET /work-schedule/emails` answers `404` while the configuration is missing —
 * `assertConfigured` refuses it, because the addresses are not an empty
 * collection but an absent one. Rather than render that as a failure, the card
 * says so and mounts no query at all. It is the same fact the alert at the top
 * of the form states, said once more where it changes what this card can do.
 */
export const TimesheetApprovalEmailsSection = ({
  isScheduleConfigured,
}: TimesheetApprovalEmailsSectionProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailIcon className="size-5 shrink-0" aria-hidden="true" />
          {t('workSchedule.emails.title')}
        </CardTitle>
        <CardDescription>{t('workSchedule.emails.description')}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {!isScheduleConfigured ? (
          <p className="text-sm text-muted-foreground">
            {t('workSchedule.emails.unavailable')}
          </p>
        ) : (
          <>
            {/*
             * The list is inside the boundary and the add control is outside
             * it: adding an address needs nothing loaded, so the affordance
             * renders immediately and stays put while the chips suspend into a
             * skeleton shaped like them. A failed fetch renders
             * `QueryErrorState` inside this card, so the addresses fail on their
             * own without taking the configuration form down with them.
             */}
            <QueryBoundary fallback={<TimesheetApprovalEmailsSkeleton />}>
              <TimesheetApprovalEmailsList />
            </QueryBoundary>

            <Can permission="WORK_SCHEDULE.CONFIGURE">
              <TimesheetApprovalEmailAddForm />
            </Can>
          </>
        )}
      </CardContent>
    </Card>
  );
};
