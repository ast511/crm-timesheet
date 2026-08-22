import { useTranslation } from 'react-i18next';

import { FadeIn } from '@/components/motion/FadeIn';
import { QueryBoundary } from '@/components/QueryBoundary';
import { WorkScheduleSettings } from '@/features/work-schedule/components/WorkScheduleSettings';
import { WorkScheduleSkeleton } from '@/features/work-schedule/components/WorkScheduleSkeleton';
import { usePageMeta } from '@/hooks/usePageMeta';

/**
 * `/app/team/settings/work-schedule` — the company's working week, its hour
 * rules, and where a completed timesheet is sent for approval.
 *
 * ## The first screen in this application that is not a list
 *
 * Every settings page before it — leave types, departments, public holidays,
 * projects — renders a collection: a `DataTable`, a create button, a row menu,
 * a dialog per record. This one renders **one record that always exists at one
 * address**, so there is no table, no pagination, no create and no delete. It is
 * a form, read with `GET` and replaced whole with `PUT`.
 *
 * That shape follows from the resource rather than from a preference. There is
 * exactly one working schedule for the company; a collection would imply a
 * client may choose between configurations, and there is nothing to choose from.
 *
 * ## Three cards, from the mock
 *
 * The working week, the hour rules, and the approval addresses — in that order,
 * with the mock's headings, icons, count badge, presets and note. The first two
 * are one `<form>` because they are one `PUT`; the third is a separate feature
 * of the same module, on its own endpoints and its own permission.
 *
 * ## This is a Timesheets dependency, not only a settings screen
 *
 * `GET /api/v1/work-schedule` is, in the backend's words, *"the endpoint every
 * client needs before it renders a single timestamp"* — the company timezone
 * lives on it, and `lib/datetime.ts` requires a zone in every signature
 * precisely so nothing silently uses the browser's. The query this page
 * introduces is where that value will come from. It is deliberately kept out of
 * this form's editable set; see `WorkScheduleForm` on the round-trip.
 *
 * ## The boundary is around the settings, not around the heading
 *
 * `usePageMeta` and the `<h1>` state facts that do not depend on the response,
 * so they render immediately and stay put while the cards suspend into a
 * skeleton shaped like them. `QueryBoundary` also supplies the error boundary
 * the suspended query needs — though note that "nothing configured yet" is not
 * one of the failures it catches: a `404` is turned into a `null` schedule and
 * an explanatory alert, because it is a state to act on rather than an error to
 * retry.
 *
 * The route already refuses anybody without `WORK_SCHEDULE.PAGE_ACCESS` before
 * this component mounts, so nothing here re-checks it. What the page gates is
 * the actions, and it gates them on two different keys: saving the schedule on
 * `WORK_SCHEDULE.EDIT`, maintaining the addresses on `WORK_SCHEDULE.CONFIGURE`,
 * exactly as the backend does.
 */
export const WorkSchedulePage = () => {
  const { t } = useTranslation();

  usePageMeta({
    title: t('pages.settingsWorkSchedule.title'),
    description: t('pages.settingsWorkSchedule.description'),
  });

  return (
    <FadeIn className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{t('workSchedule.title')}</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          {t('workSchedule.description')}
        </p>
      </div>

      <QueryBoundary fallback={<WorkScheduleSkeleton />}>
        <WorkScheduleSettings />
      </QueryBoundary>
    </FadeIn>
  );
};
