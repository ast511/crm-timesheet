import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  createForgotPasswordSchema,
  createLoginSchema,
  createSetPasswordSchema,
  type AuthValidationMessages,
} from './auth-schemas';

/**
 * The auth schemas, with their messages in the current language.
 *
 * Memoised on `t` so a schema is rebuilt when the language changes and not on
 * every keystroke — `useForm`'s resolver is captured at mount, and handing it a
 * new schema object per render would defeat that for no benefit.
 *
 * The two lengths are interpolated rather than written into the sentence, so
 * the translation and the rule cannot disagree about the number.
 */
export const useAuthSchemas = () => {
  const { t } = useTranslation();

  return useMemo(() => {
    const messages: AuthValidationMessages = {
      emailRequired: t('auth.validation.emailRequired'),
      emailInvalid: t('auth.validation.emailInvalid'),
      emailTooLong: t('auth.validation.emailTooLong'),
      passwordRequired: t('auth.validation.passwordRequired'),
      passwordTooShort: t('auth.validation.passwordTooShort', { min: PASSWORD_MIN_LENGTH }),
      passwordTooLong: t('auth.validation.passwordTooLong', { max: PASSWORD_MAX_LENGTH }),
      passwordMismatch: t('auth.validation.passwordMismatch'),
    };

    return {
      loginSchema: createLoginSchema(messages),
      forgotPasswordSchema: createForgotPasswordSchema(messages),
      setPasswordSchema: createSetPasswordSchema(messages),
    };
  }, [t]);
};
