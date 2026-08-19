import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  PHONE_MAX_LENGTH,
  createProfilePhoneSchema,
  type ProfileValidationMessages,
} from './profile-schemas';

/**
 * The profile schema, with its messages in the current language.
 *
 * The same arrangement `useAuthSchemas` uses, and for the same two reasons: a
 * schema with Romanian strings baked in would be a second translation system
 * living outside `locales/`, and memoising on `t` rebuilds it when the language
 * changes rather than on every keystroke — `useForm`'s resolver is captured at
 * mount, so a fresh schema object per render would defeat that for no benefit.
 *
 * The length is interpolated rather than written into the sentence, so the
 * translation and the rule cannot disagree about the number.
 */
export const useProfileSchemas = () => {
  const { t } = useTranslation();

  return useMemo(() => {
    const messages: ProfileValidationMessages = {
      phoneTooLong: t('profile.validation.phoneTooLong', { max: PHONE_MAX_LENGTH }),
    };

    return { profilePhoneSchema: createProfilePhoneSchema(messages) };
  }, [t]);
};
