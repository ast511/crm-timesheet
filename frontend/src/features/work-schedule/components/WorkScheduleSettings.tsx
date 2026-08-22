import { useSuspenseWorkSchedule } from '../useWorkSchedule';
import { TimesheetApprovalEmailsSection } from './TimesheetApprovalEmailsSection';
import { WorkScheduleForm } from './WorkScheduleForm';

/**
 * The three cards, once the configuration is known.
 *
 * It exists so `WorkSchedulePage` can put a `QueryBoundary` around *one* child
 * rather than around each card: this component is what suspends, and the
 * schedule it reads is what both halves below need — the form to initialise
 * itself, the addresses to know whether they exist at all.
 *
 * ## The form is not re-keyed when the query refetches
 *
 * `useForm` reads `defaultValues` once, so a refetch that returns different
 * values leaves the inputs showing what was loaded when the screen opened. That
 * is deliberate. Forcing a remount — `key={schedule.updatedAt}` — would keep the
 * inputs in step with the cache at the cost of **discarding whatever the person
 * had typed**, on a schedule the stale window makes unpredictable, and it would
 * pull focus out of the field they were editing.
 *
 * The case that actually matters is covered elsewhere: a successful save calls
 * `reset` with the response, so the form re-initialises from what was stored.
 * What is left is a colleague changing the configuration during somebody else's
 * edit, and the honest answer there is the one every form in this application
 * gives — the second save wins, and the values come back from the response.
 */
export const WorkScheduleSettings = () => {
  const schedule = useSuspenseWorkSchedule();

  return (
    <>
      <WorkScheduleForm schedule={schedule} />

      <TimesheetApprovalEmailsSection isScheduleConfigured={schedule !== null} />
    </>
  );
};
