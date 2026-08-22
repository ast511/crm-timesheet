import { useTranslation } from 'react-i18next';

import { FormColorField } from '@/components/form/FormColorField';

/** What the native picker shows while the field is empty. Never submitted. */
const PICKER_FALLBACK = '#22C55E';

export interface LeaveTypeColorFieldProps {
  label: string;
  /** `#RRGGBB`, or `''` for "no accent colour". */
  value: string;
  onChange: (color: string) => void;
  error?: string;
}

/**
 * The leave type's accent colour — `FormColorField` with this feature's words.
 *
 * The control itself moved to `components/form/FormColorField.tsx` when F11
 * needed the same swatch-and-hex pair for a project's colour, against an
 * identically-specified `#RRGGBB` column. Everything that was general about it
 * — one value across two inputs, the guard that stops an incomplete hex
 * flashing black in the picker, the clear button that reaches the "no colour"
 * state neither input can express, the label/error wiring — is there now, and
 * what stays here is what is actually about leave types: the three sentences.
 *
 * This wrapper rather than a call site change, so `LeaveTypeForm` is untouched
 * and the strings live one file away from the field they describe.
 */
export const LeaveTypeColorField = ({
  label,
  value,
  onChange,
  error,
}: LeaveTypeColorFieldProps) => {
  const { t } = useTranslation();

  return (
    <FormColorField
      label={label}
      value={value}
      onChange={onChange}
      hint={t('leaveTypes.fields.colorHint')}
      pickerLabel={t('leaveTypes.fields.colorPicker')}
      clearLabel={t('leaveTypes.fields.colorClear')}
      fallbackColor={PICKER_FALLBACK}
      error={error}
    />
  );
};
