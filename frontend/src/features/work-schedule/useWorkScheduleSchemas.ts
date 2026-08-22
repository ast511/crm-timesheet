import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  EMAIL_MAX_LENGTH,
  createTimesheetApprovalEmailSchema,
} from './timesheet-approval-email-schemas';
import { MAX_HOURS_PER_DAY, MAX_HOURS_PER_WEEK } from './work-schedule-api';
import {
  createWorkScheduleSchema,
  type WorkScheduleValidationMessages,
} from './work-schedule-schemas';
import { DEFAULT_TIMEZONE } from './work-schedule-timezones';

/**
 * The two schemas of this screen, with their messages in the current language.
 *
 * The arrangement every feature from F06 onwards uses: a schema with Romanian
 * strings baked in would be a second translation system living outside
 * `locales/`, and memoising on `t` rebuilds it when the language changes rather
 * than on every keystroke.
 *
 * Both are built here rather than in two hooks because they are two forms on
 * one screen, and the bounds they interpolate come from the same module.
 */
export const useWorkScheduleSchemas = () => {
  const { t } = useTranslation();

  return useMemo(() => {
    const messages: WorkScheduleValidationMessages = {
      workingDaysRequired: t('workSchedule.validation.workingDaysRequired'),
      timeRequired: t('workSchedule.validation.timeRequired'),
      timeInvalid: t('workSchedule.validation.timeInvalid'),
      hoursRequired: t('workSchedule.validation.hoursRequired'),
      hoursInvalid: t('workSchedule.validation.hoursInvalid'),
      hoursOutOfRange: t('workSchedule.validation.hoursOutOfRange', {
        max: MAX_HOURS_PER_DAY,
      }),
      weeklyHoursOutOfRange: t('workSchedule.validation.hoursOutOfRange', {
        max: MAX_HOURS_PER_WEEK,
      }),
      lunchHoursOutOfRange: t('workSchedule.validation.lunchHoursOutOfRange', {
        max: MAX_HOURS_PER_DAY,
      }),
      maxEntryNotAboveMin: t('workSchedule.validation.maxEntryNotAboveMin'),
      timezoneRequired: t('workSchedule.validation.timezoneRequired'),
      timezoneUnsupported: t('workSchedule.validation.timezoneUnsupported', {
        example: DEFAULT_TIMEZONE,
      }),
    };

    return {
      workScheduleSchema: createWorkScheduleSchema(messages),
      timesheetApprovalEmailSchema: createTimesheetApprovalEmailSchema({
        emailRequired: t('workSchedule.emails.validation.emailRequired'),
        emailInvalid: t('workSchedule.emails.validation.emailInvalid'),
        emailTooLong: t('workSchedule.emails.validation.emailTooLong', {
          max: EMAIL_MAX_LENGTH,
        }),
      }),
    };
  }, [t]);
};
