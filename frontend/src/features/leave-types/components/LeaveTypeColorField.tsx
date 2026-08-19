import { XIcon } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { LEAVE_TYPE_COLOR_LENGTH, LEAVE_TYPE_COLOR_PATTERN } from '../leave-type-schemas';

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
 * The accent colour: a swatch picker and the hex code, over one value.
 *
 * ## Why both controls
 *
 * `<input type="color">` alone cannot express **"no colour"** — it always holds
 * one, and `color` is genuinely optional in the contract. A text field alone
 * makes somebody type `#22C55E` from memory. So the two are bound to the same
 * form value: the picker writes the hex, the text field accepts a pasted one,
 * and a clear button restores the absent state that neither control can reach
 * on its own.
 *
 * The picker is only *fed* a colour when the current value is a complete
 * `#RRGGBB` — while somebody is midway through typing `#22C`, an incomplete
 * value would make the browser fall back to black and flash a colour nobody
 * chose.
 *
 * Upper-casing happens in the schema rather than on every keystroke, matching
 * the backend's own `@Transform`: `#aabbcc` and `#AABBCC` are one stored value,
 * not two spellings, and the person typing does not need to know that.
 */
export const LeaveTypeColorField = ({
  label,
  value,
  onChange,
  error,
}: LeaveTypeColorFieldProps) => {
  const { t } = useTranslation();
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const pickerId = `${fieldId}-picker`;
  const isComplete = LEAVE_TYPE_COLOR_PATTERN.test(value.trim().toUpperCase());

  return (
    <div className="grid gap-2">
      <label htmlFor={fieldId} className="text-sm leading-none font-medium">
        {label}
      </label>

      <div className="flex items-center gap-2">
        <input
          id={pickerId}
          type="color"
          value={isComplete ? value.trim().toUpperCase() : PICKER_FALLBACK}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          aria-label={t('leaveTypes.fields.colorPicker')}
          className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />

        <Input
          id={fieldId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={PICKER_FALLBACK}
          maxLength={LEAVE_TYPE_COLOR_LENGTH}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error !== undefined}
          aria-describedby={error === undefined ? undefined : errorId}
          className="font-mono uppercase"
        />

        {value !== '' && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange('')}
            aria-label={t('leaveTypes.fields.colorClear')}
          >
            <XIcon aria-hidden="true" />
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">{t('leaveTypes.fields.colorHint')}</p>

      {error !== undefined && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
};