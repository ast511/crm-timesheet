import { useTranslation } from 'react-i18next';

import { formatCalendarDate } from '@/lib/datetime';

import type { Project } from '../projects-api';

export type ProjectPeriodProps = Pick<Project, 'startDate' | 'endDate'>;

/**
 * The *Perioadă* column: when the project runs, with either end possibly open.
 *
 * ## Four cases, and none of them is missing data
 *
 * Both dates are nullable in the contract, and the reason is stated there: *a
 * project may be planned before its dates are known*. So each combination is a
 * real statement rather than an absence to apologise for —
 *
 * | Stored | Printed |
 * | --- | --- |
 * | neither | `—`, the project has no dates yet |
 * | start only | `Din 01.09.2026` — it began, with no end planned |
 * | end only | `Până la 31.12.2026` — a deadline, with no start recorded |
 * | both | `01.09.2026 – 31.12.2026` |
 *
 * A project that starts and ends the same day prints once rather than as
 * `01.09.2026 – 01.09.2026`, which the backend explicitly allows and which
 * would otherwise be noise.
 *
 * ## No day-shift, by construction
 *
 * `formatCalendarDate` fixes the zone to **UTC**, the zone these values were
 * written in. A project's start is a day on a calendar rather than a moment,
 * and the backend stores it by parsing `2026-09-01` into midnight UTC —
 * rendering that instant in any zone west of Greenwich prints 31 August.
 * `formatDate` and the company timezone are for instants such as `createdAt`;
 * they are the wrong tool here and would produce exactly that defect. The
 * argument in full is in `lib/datetime.ts`.
 *
 * The full year *is* printed, unlike `PublicHolidaySpan`'s recurring case: a
 * project's dates name one specific span, and there is nothing recurring about
 * them.
 */
export const ProjectPeriod = ({ startDate, endDate }: ProjectPeriodProps) => {
  const { t } = useTranslation();

  if (startDate === null && endDate === null) {
    return <span className="text-muted-foreground">{t('projects.columns.noValue')}</span>;
  }

  const start = startDate === null ? null : formatCalendarDate(startDate);
  const end = endDate === null ? null : formatCalendarDate(endDate);

  const label =
    start === null
      ? t('projects.period.until', { end })
      : end === null
        ? t('projects.period.from', { start })
        : start === end
          ? start
          : t('projects.period.range', { start, end });

  return <span className="whitespace-nowrap tabular-nums">{label}</span>;
};
