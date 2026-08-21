import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  EMAIL_MAX_LENGTH,
  createLeaveNotificationEmailSchema,
  type LeaveNotificationEmailValidationMessages,
} from './leave-notification-email-schemas';

/**
 * The address schema, with its messages in the current language.
 *
 * The arrangement `useLeaveTypeSchemas` and `useDepartmentSchemas` already use:
 * a schema with Romanian strings baked in would be a second translation system
 * living outside `locales/`, and memoising on `t` rebuilds it when the language
 * changes rather than on every keystroke.
 */
export const useLeaveNotificationEmailSchemas = () => {
  const { t } = useTranslation();

  return useMemo(() => {
    const messages: LeaveNotificationEmailValidationMessages = {
      emailRequired: t('leaveNotificationEmails.validation.emailRequired'),
      emailInvalid: t('leaveNotificationEmails.validation.emailInvalid'),
      emailTooLong: t('leaveNotificationEmails.validation.emailTooLong', {
        max: EMAIL_MAX_LENGTH,
      }),
    };

    return {
      leaveNotificationEmailSchema: createLeaveNotificationEmailSchema(messages),
    };
  }, [t]);
};
