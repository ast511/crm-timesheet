import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DEPARTMENT_CODE_MAX_LENGTH,
  DEPARTMENT_DESCRIPTION_MAX_LENGTH,
  DEPARTMENT_NAME_MAX_LENGTH,
  createDepartmentSchema,
  type DepartmentValidationMessages,
} from './department-schemas';

/**
 * The department schema, with its messages in the current language.
 *
 * The arrangement `useLeaveTypeSchemas` and `useProfileSchemas` already use, for
 * the same two reasons: a schema with Romanian strings baked in would be a
 * second translation system living outside `locales/`, and memoising on `t`
 * rebuilds it when the language changes rather than on every keystroke.
 *
 * Every number is interpolated rather than written into the sentence, so a
 * translation and the rule it describes cannot disagree about the bound.
 */
export const useDepartmentSchemas = () => {
  const { t } = useTranslation();

  return useMemo(() => {
    const messages: DepartmentValidationMessages = {
      codeRequired: t('departments.validation.codeRequired'),
      codeTooLong: t('departments.validation.codeTooLong', { max: DEPARTMENT_CODE_MAX_LENGTH }),
      codeInvalid: t('departments.validation.codeInvalid'),
      nameRequired: t('departments.validation.nameRequired'),
      nameTooLong: t('departments.validation.nameTooLong', { max: DEPARTMENT_NAME_MAX_LENGTH }),
      descriptionTooLong: t('departments.validation.descriptionTooLong', {
        max: DEPARTMENT_DESCRIPTION_MAX_LENGTH,
      }),
    };

    return { departmentSchema: createDepartmentSchema(messages) };
  }, [t]);
};
