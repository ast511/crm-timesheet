import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  PROJECT_CLIENT_NAME_MAX_LENGTH,
  PROJECT_CODE_MAX_LENGTH,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_MAX_ESTIMATED_HOURS,
  PROJECT_MIN_ESTIMATED_HOURS,
  PROJECT_NAME_MAX_LENGTH,
  createProjectSchema,
  type ProjectValidationMessages,
} from './project-schemas';

/**
 * The project schema, with its messages in the current language.
 *
 * The arrangement every form feature before this one uses, for the same two
 * reasons: a schema with Romanian strings baked in would be a second
 * translation system living outside `locales/`, and memoising on `t` rebuilds
 * it when the language changes rather than on every keystroke.
 *
 * Every number is interpolated rather than written into the sentence, so a
 * translation and the rule it describes cannot disagree about the bound.
 */
export const useProjectSchemas = () => {
  const { t } = useTranslation();

  return useMemo(() => {
    const messages: ProjectValidationMessages = {
      codeRequired: t('projects.validation.codeRequired'),
      codeTooLong: t('projects.validation.codeTooLong', { max: PROJECT_CODE_MAX_LENGTH }),
      codeInvalid: t('projects.validation.codeInvalid'),
      nameRequired: t('projects.validation.nameRequired'),
      nameTooLong: t('projects.validation.nameTooLong', { max: PROJECT_NAME_MAX_LENGTH }),
      clientNameRequired: t('projects.validation.clientNameRequired'),
      clientNameTooLong: t('projects.validation.clientNameTooLong', {
        max: PROJECT_CLIENT_NAME_MAX_LENGTH,
      }),
      descriptionTooLong: t('projects.validation.descriptionTooLong', {
        max: PROJECT_DESCRIPTION_MAX_LENGTH,
      }),
      estimatedHoursRequired: t('projects.validation.estimatedHoursRequired'),
      estimatedHoursInvalid: t('projects.validation.estimatedHoursInvalid'),
      estimatedHoursOutOfRange: t('projects.validation.estimatedHoursOutOfRange', {
        min: PROJECT_MIN_ESTIMATED_HOURS,
        max: PROJECT_MAX_ESTIMATED_HOURS,
      }),
      colorInvalid: t('projects.validation.colorInvalid'),
      startDateInvalid: t('projects.validation.startDateInvalid'),
      endDateInvalid: t('projects.validation.endDateInvalid'),
      endBeforeStart: t('projects.validation.endBeforeStart'),
    };

    return { projectSchema: createProjectSchema(messages) };
  }, [t]);
};
