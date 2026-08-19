import { useId, type ReactNode } from 'react';

import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export interface FormSwitchFieldProps {
  /** The visible label. Always rendered — a switch with no label says nothing. */
  label: string;
  /** What turning it on actually means. Rendered under the label. */
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * A labelled switch row: what it is on the left, the toggle on the right.
 *
 * The counterpart of `FormField` for a boolean, and it exists for the same
 * reason — the wiring is what gets subtly wrong when it is written per form.
 * The `<label>` points at the switch's hidden input, so clicking the text
 * toggles it and a screen reader announces the two together; the description is
 * associated through `aria-describedby` rather than merely sitting nearby.
 *
 * It is controlled, because a boolean in a `react-hook-form` form is driven
 * through `Controller` rather than `register` — a switch is not an `<input>`
 * whose `ref` and `onChange` can be spread onto it.
 */
export const FormSwitchField = ({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
}: FormSwitchFieldProps) => {
  const fieldId = useId();
  const descriptionId = `${fieldId}-description`;

  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="grid gap-1">
        <label htmlFor={fieldId} className="text-sm leading-none font-medium">
          {label}
        </label>
        {description !== undefined && (
          <p id={descriptionId} className="text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      <Switch
        id={fieldId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description === undefined ? undefined : descriptionId}
        className="mt-0.5"
      />
    </div>
  );
};