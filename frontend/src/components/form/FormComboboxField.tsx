import { useId, type ReactNode } from 'react';

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@/components/ui/combobox';
import { cn } from '@/lib/utils';

export interface FormComboboxFieldProps<TValue extends string> {
  /** The visible label. Always rendered — a placeholder is not a label. */
  label: string;
  /** What choosing between the options actually decides. */
  description?: ReactNode;
  value: TValue;
  onChange: (value: TValue) => void;
  /**
   * Every value that may be chosen, in the order they should be offered.
   *
   * Plain strings rather than `{ value, label }` pairs: this field exists for
   * lists whose value *is* what a person reads — an IANA zone name is the case
   * it was written for — and a pair would invite a display name that the
   * backend's accepted set does not contain.
   */
  options: readonly TValue[];
  /** Shown on the trigger before anything is chosen. */
  placeholder?: string;
  /** The search box's accessible name. It is not a labelled field otherwise. */
  searchLabel: string;
  searchPlaceholder?: string;
  /** What the popup says when the query matches nothing. */
  emptyMessage: string;
  /** The validation message, already translated. Absent means valid. */
  error?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A labelled, **searchable** select over a long closed list, with its error.
 *
 * The counterpart of `FormSelectField` for a list nobody can scroll: seven
 * weekdays are a `<Select>`, four hundred IANA zone names are not. Typing
 * filters, so `Bucharest` finds `Europe/Bucharest` without knowing it is filed
 * under Europe.
 *
 * ## The wiring is here for the reason `FormField`'s is
 *
 * Three attributes derived from one generated id — `htmlFor`, `aria-describedby`
 * and `aria-invalid` — none of which can drift. The label points at the
 * **trigger**, which is a `<button>` and therefore a labelable element; the
 * search box inside the popup gets its own name from `searchLabel`, because it
 * is a second control that appears only once the popup is open and would
 * otherwise be announced as an unnamed text field.
 *
 * ## Keyboard
 *
 * Base UI's `Combobox` is what supplies it, which is why this is built on the
 * primitive rather than on a `Popover` with an `<input>` inside: Enter and Space
 * open the popup from the trigger, typing filters, the arrows move the
 * highlight, Enter chooses, Escape closes and returns focus to the trigger. A
 * hand-rolled equivalent is exactly the thing `CLAUDE.md` says not to write.
 *
 * It is controlled, like `FormSelectField` and for the same reason: a combobox
 * is not an `<input>` whose `ref` and `onChange` a `register` spread can land
 * on, so a form drives it through `Controller`.
 */
export const FormComboboxField = <TValue extends string>({
  label,
  description,
  value,
  onChange,
  options,
  placeholder,
  searchLabel,
  searchPlaceholder,
  emptyMessage,
  error,
  disabled,
  className,
}: FormComboboxFieldProps<TValue>) => {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const descriptionId = `${fieldId}-description`;

  /*
   * Both, either or neither — and *absent* rather than empty when neither,
   * since `aria-describedby=""` points a screen reader at an element that does
   * not exist. The same composition `FormField` and `FormSelectField` perform.
   */
  const describedBy =
    [
      error === undefined ? undefined : errorId,
      description === undefined ? undefined : descriptionId,
    ]
      .filter((id): id is string => id !== undefined)
      .join(' ') || undefined;

  return (
    <div className={cn('grid gap-2', className)}>
      <label htmlFor={fieldId} className="text-sm leading-none font-medium">
        {label}
      </label>

      {/*
       * `onValueChange` is handed `null` when a selection is cleared. This
       * field offers no clear control and the list is closed, so that case is
       * folded back onto the current value rather than widening `TValue` with a
       * `null` no caller could store — as `FormSelectField` does.
       */}
      <Combobox
        items={options}
        value={value}
        onValueChange={(next: TValue | null) => onChange(next ?? value)}
        disabled={disabled}
      >
        <ComboboxTrigger
          id={fieldId}
          aria-invalid={error !== undefined}
          aria-describedby={describedBy}
        >
          <ComboboxValue placeholder={placeholder} />
        </ComboboxTrigger>

        <ComboboxContent>
          <ComboboxInput aria-label={searchLabel} placeholder={searchPlaceholder} />

          {/*
           * `Combobox.Empty`'s element stays mounted whether or not the list is
           * empty — it is a polite live region, and one that is removed cannot
           * announce anything. Its padding collapses via `empty:` instead.
           */}
          <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>

          <ComboboxList>
            {(option: TValue) => (
              <ComboboxItem key={option} value={option}>
                {option}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      {description !== undefined && (
        <p id={descriptionId} className="text-xs text-muted-foreground">
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
