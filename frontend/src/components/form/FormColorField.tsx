import { XIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Seven characters: `#` and six hexadecimal digits. */
export const HEX_COLOR_LENGTH = 7;

/** `#RRGGBB`, upper-case — the one spelling both APIs that use this store. */
export const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/;

export interface FormColorFieldProps {
  label: string;
  /** `#RRGGBB`, or `''` for "no colour". */
  value: string;
  onChange: (color: string) => void;
  /** Sits under the controls, saying what the colour is for. */
  hint?: ReactNode;
  /** Accessible name for the swatch picker — it has no visible label. */
  pickerLabel: string;
  /** Accessible name for the clear button. */
  clearLabel: string;
  /** The colour the picker shows while the field is empty. Never submitted. */
  fallbackColor?: string;
  /** The validation message, already translated. Absent means valid. */
  error?: string;
}

const DEFAULT_FALLBACK_COLOR = '#3B82F6';

/**
 * An optional accent colour: a swatch picker and the hex code, over one value.
 *
 * ## Why both controls
 *
 * `<input type="color">` alone cannot express **"no colour"** — it always holds
 * one, and `color` is genuinely optional in both contracts that use this. A
 * text field alone makes somebody type `#3B82F6` from memory. So the two are
 * bound to the same form value: the picker writes the hex, the text field
 * accepts a pasted one, and a clear button restores the absent state that
 * neither control can reach on its own.
 *
 * The picker is only *fed* a colour when the current value is a complete
 * `#RRGGBB` — while somebody is midway through typing `#3B8`, an incomplete
 * value would make the browser fall back to black and flash a colour nobody
 * chose.
 *
 * Upper-casing happens in each feature's schema rather than on every keystroke,
 * matching the backends' own `@Transform`: `#3b82f6` and `#3B82F6` are one
 * stored value, not two spellings, and the person typing does not need to know
 * that.
 *
 * ## Why it is shared
 *
 * It was `LeaveTypeColorField` first, and the projects form needs the same
 * control against an identically-specified `#RRGGBB` column. The wiring — one
 * value across two inputs, the incomplete-value guard, the clear button, the
 * label/error/`aria-invalid` association — is not about leave types or about
 * projects, so it moved here rather than being copied. The strings stay with
 * each feature, since what the colour *means* differs; `LeaveTypeColorField` is
 * now this component plus its own sentences.
 */
export const FormColorField = ({
  label,
  value,
  onChange,
  hint,
  pickerLabel,
  clearLabel,
  fallbackColor = DEFAULT_FALLBACK_COLOR,
  error,
}: FormColorFieldProps) => {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const pickerId = `${fieldId}-picker`;
  const isComplete = HEX_COLOR_PATTERN.test(value.trim().toUpperCase());

  return (
    <div className="grid gap-2">
      <label htmlFor={fieldId} className="text-sm leading-none font-medium">
        {label}
      </label>

      <div className="flex items-center gap-2">
        <input
          id={pickerId}
          type="color"
          value={isComplete ? value.trim().toUpperCase() : fallbackColor}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          aria-label={pickerLabel}
          className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />

        <Input
          id={fieldId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={fallbackColor}
          maxLength={HEX_COLOR_LENGTH}
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
            aria-label={clearLabel}
          >
            <XIcon aria-hidden="true" />
          </Button>
        )}
      </div>

      {hint !== undefined && <p className="text-sm text-muted-foreground">{hint}</p>}

      {/*
       * `role="alert"`, as `FormField` does: a message that appears after a
       * failed submit is a change somebody using a screen reader has no other
       * way to notice, since focus has not moved.
       */}
      {error !== undefined && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
};
