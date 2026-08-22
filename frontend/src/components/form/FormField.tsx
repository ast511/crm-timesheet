import { useId, type ComponentProps, type ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface FormFieldProps extends ComponentProps<'input'> {
  /** The visible label. Always rendered — a placeholder is not a label. */
  label: string;
  /**
   * What the value actually decides, rendered under the input and tied to it by
   * `aria-describedby` — so it is *read out* with the field rather than being
   * text a sighted reader happens to see nearby.
   *
   * The same prop `FormSelectField` has, with the same meaning. It is for a
   * standing explanation ("the maximum any single entry may be"), never for the
   * validation message: that is `error`, which is announced and styled
   * differently because it is about this attempt rather than about the field.
   */
  description?: ReactNode;
  /** The validation message, already translated. Absent means valid. */
  error?: string;
  /**
   * Rendered on the label's own line, aligned to the end — the "forgot your
   * password?" link on the login form is the case this exists for. Keeping it
   * beside the label rather than under the input is what the design asks for
   * and what stops it being mistaken for a hint about the field's value.
   */
  labelAction?: ReactNode;
  /** Class for the field wrapper. The input keeps its own `className`. */
  fieldClassName?: string;
}

/**
 * A label, an input and its error message, wired together.
 *
 * Every form in this application has the same three-part field, and the part
 * that is easy to get subtly wrong each time is the wiring rather than the
 * markup: the label has to point at the input, the error has to be announced
 * when it appears, and the input has to be marked invalid so it is styled and
 * reported as such. Done here once, three attributes are derived from one
 * generated id and none of them can drift.
 *
 * It takes the input's props directly, so `react-hook-form`'s `register` spread
 * lands on the input — including its `ref`, which React 19 passes through as an
 * ordinary prop:
 *
 * ```tsx
 * <FormField
 *   label={t('auth.fields.email')}
 *   error={errors.email?.message}
 *   type="email"
 *   {...register('email')}
 * />
 * ```
 */
export const FormField = ({
  label,
  description,
  error,
  labelAction,
  fieldClassName,
  className,
  id,
  ...inputProps
}: FormFieldProps) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const descriptionId = `${fieldId}-description`;

  /*
   * Both, either or neither — and *absent* rather than empty when neither,
   * since `aria-describedby=""` points a screen reader at an element that does
   * not exist. The same composition `FormSelectField` performs.
   */
  const describedBy =
    [
      error === undefined ? undefined : errorId,
      description === undefined ? undefined : descriptionId,
    ]
      .filter((value): value is string => value !== undefined)
      .join(' ') || undefined;

  return (
    <div className={cn('grid gap-2', fieldClassName)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={fieldId} className="text-sm leading-none font-medium">
          {label}
        </label>
        {labelAction}
      </div>

      <Input
        id={fieldId}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy}
        className={className}
        {...inputProps}
      />

      {description !== undefined && (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}

      {/*
       * `role="alert"` rather than a plain paragraph: a message that appears
       * after a failed submit is a change somebody using a screen reader has
       * no other way to notice, since focus has not moved.
       */}
      {error !== undefined && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
};
