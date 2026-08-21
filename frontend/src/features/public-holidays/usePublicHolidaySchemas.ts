import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  PUBLIC_HOLIDAY_DESCRIPTION_MAX_LENGTH,
  PUBLIC_HOLIDAY_MAX_YEAR,
  PUBLIC_HOLIDAY_MIN_YEAR,
  PUBLIC_HOLIDAY_NAME_MAX_LENGTH,
  createPublicHolidaySchema,
  type PublicHolidayValidationMessages,
} from './public-holiday-schemas';

/**
 * The public-holiday schema, with its messages in the current language.
 *
 * The arrangement `useLeaveTypeSchemas`, `useProfileSchemas` and
 * `useDepartmentSchemas` already use, for the same two reasons: a schema with
 * Romanian strings baked in would be a second translation system living outside
 * `locales/`, and memoising on `t` rebuilds it when the language changes rather
 * than on every keystroke.
 *
 * Every number is interpolated rather than written into the sentence, so a
 * translation and the rule it describes cannot disagree about the bound.
 */
export const usePublicHolidaySchemas = () => {
  const { t } = useTranslation();

  return useMemo(() => {
    const messages: PublicHolidayValidationMessages = {
      nameRequired: t('publicHolidays.validation.nameRequired'),
      nameTooLong: t('publicHolidays.validation.nameTooLong', {
        max: PUBLIC_HOLIDAY_NAME_MAX_LENGTH,
      }),
      descriptionTooLong: t('publicHolidays.validation.descriptionTooLong', {
        max: PUBLIC_HOLIDAY_DESCRIPTION_MAX_LENGTH,
      }),
      startDateRequired: t('publicHolidays.validation.startDateRequired'),
      startDateInvalid: t('publicHolidays.validation.startDateInvalid'),
      endDateRequired: t('publicHolidays.validation.endDateRequired'),
      endDateInvalid: t('publicHolidays.validation.endDateInvalid'),
      endBeforeStart: t('publicHolidays.validation.endBeforeStart'),
      yearInvalid: t('publicHolidays.validation.yearInvalid'),
      yearOutOfRange: t('publicHolidays.validation.yearOutOfRange', {
        min: PUBLIC_HOLIDAY_MIN_YEAR,
        max: PUBLIC_HOLIDAY_MAX_YEAR,
      }),
      validToBeforeValidFrom: t('publicHolidays.validation.validToBeforeValidFrom'),
    };

    return { publicHolidaySchema: createPublicHolidaySchema(messages) };
  }, [t]);
};
