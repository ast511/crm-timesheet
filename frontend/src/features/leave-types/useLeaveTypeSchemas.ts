import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  LEAVE_TYPE_CODE_MAX_LENGTH,
  LEAVE_TYPE_DESCRIPTION_MAX_LENGTH,
  LEAVE_TYPE_LABEL_MAX_LENGTH,
  LEAVE_TYPE_MAX_ALLOCATED_DAYS,
  LEAVE_TYPE_MIN_ALLOCATED_DAYS,
  LEAVE_TYPE_REPORT_MARKER_MAX_LENGTH,
  createLeaveTypeSchema,
  type LeaveTypeValidationMessages,
} from './leave-type-schemas';

/**
 * The leave-type schema, with its messages in the current language.
 *
 * The arrangement `useAuthSchemas` and `useProfileSchemas` already use, for the
 * same two reasons: a schema with Romanian strings baked in would be a second
 * translation system living outside `locales/`, and memoising on `t` rebuilds
 * it when the language changes rather than on every keystroke.
 *
 * Every number is interpolated rather than written into the sentence, so a
 * translation and the rule it describes cannot disagree about the bound.
 */
export const useLeaveTypeSchemas = () => {
  const { t } = useTranslation();

  return useMemo(() => {
    const messages: LeaveTypeValidationMessages = {
      codeRequired: t('leaveTypes.validation.codeRequired'),
      codeTooLong: t('leaveTypes.validation.codeTooLong', { max: LEAVE_TYPE_CODE_MAX_LENGTH }),
      codeInvalid: t('leaveTypes.validation.codeInvalid'),
      labelRequired: t('leaveTypes.validation.labelRequired'),
      labelTooLong: t('leaveTypes.validation.labelTooLong', { max: LEAVE_TYPE_LABEL_MAX_LENGTH }),
      reportMarkerRequired: t('leaveTypes.validation.reportMarkerRequired'),
      reportMarkerInvalid: t('leaveTypes.validation.reportMarkerInvalid', {
        max: LEAVE_TYPE_REPORT_MARKER_MAX_LENGTH,
      }),
      iconRequired: t('leaveTypes.validation.iconRequired'),
      colorInvalid: t('leaveTypes.validation.colorInvalid'),
      descriptionTooLong: t('leaveTypes.validation.descriptionTooLong', {
        max: LEAVE_TYPE_DESCRIPTION_MAX_LENGTH,
      }),
      daysInvalid: t('leaveTypes.validation.daysInvalid'),
      daysRange: t('leaveTypes.validation.daysRange', {
        min: LEAVE_TYPE_MIN_ALLOCATED_DAYS,
        max: LEAVE_TYPE_MAX_ALLOCATED_DAYS,
      }),
    };

    return { leaveTypeSchema: createLeaveTypeSchema(messages) };
  }, [t]);
};