import { useId, type ReactNode } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface FormSelectOption<TValue extends string> {
  value: TValue;
  /** Already translated — this component never looks a key up. */
  label: string;
}

export interface FormSelectFieldProps<TValue extends string> {
  /** The visible label. Always rendered — a placeholder is not a label. */
  label: string;
  /** What choosing between the options actually decides. */
  description?: ReactNode;
  value: TValue;
  onChange: (value: TValue) => void;
  options: readonly FormSelectOption<TValue>[];
  /** The validation message, already translated. Absent means valid. */
  error?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A labelled `<Select>` over a closed list of values, with its error message.
 *
 * The counterpart of `FormField` for a choice, and it exists for the reason
 * that one does: the *wiring* is what quietly goes wrong when it is written per
 * form. The label has to point at the trigger, the error has to be announced
 * when it appears and associated with the control, and the trigger has to be
 * marked invalid so it is styled and reported as such — three attributes
 * derived here from one generated id, none of which can drift.
 *
 * `LeaveTypeIconField` was the first field of this shape and stayed inside its
 * feature because its options render as glyphs. This one is the plain case, and
 * it is shared from the start rather than copied a third time.
 *
 * It is controlled, like `FormSwitchField` and for the same reason: a `Select`
 * is not an `<input>` whose `ref` and `onChange` a `register` spread can land
 * on, so a form drives it through `Controller`.
 *
 * `TValue` is the union of what the options offer, so the value a form holds is
 * the enum the API accepts rather than a `string` that merely looks like one.
 */
export const FormSelectField = <TValue extends string>({
  label,
  description,
  value,
  onChange,
  options,
  error,
  disabled,
  className,
}: FormSelectFieldProps<TValue>) => {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const descriptionId = `${fieldId}-description`;

  const selected = options.find((option) => option.value === value);

  /*
   * Both, either or neither — and *absent* rather than empty when neither,
   * since `aria-describedby=""` points a screen reader at an element that does
   * not exist.
   */
  const describedBy =
    [error === undefined ? undefined : errorId, description === undefined ? undefined : descriptionId]
      .filter((id): id is string => id !== undefined)
      .join(' ') || undefined;

  return (
    <div className={cn('grid gap-2', className)}>
      <label htmlFor={fieldId} className="text-sm leading-none font-medium">
        {label}
      </label>

      {/*
       * Base UI hands `null` to `onValueChange` when a selection is cleared.
       * The list here is closed and always has a value, so that case is folded
       * back onto the current one rather than widening `TValue` with a `null`
       * no caller could store.
       */}
      <Select
        value={value}
        onValueChange={(next) => onChange((next as TValue | null) ?? value)}
        disabled={disabled}
      >
        <SelectTrigger
          id={fieldId}
          aria-invalid={error !== undefined}
          aria-describedby={describedBy}
          className="w-full"
        >
          <SelectValue>{selected?.label ?? value}</SelectValue>
        </SelectTrigger>

        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {description !== undefined && (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}

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
