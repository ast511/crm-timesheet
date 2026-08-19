import { useId, type ComponentProps } from 'react';

import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface FormTextareaFieldProps extends ComponentProps<'textarea'> {
  /** The visible label. Always rendered — a placeholder is not a label. */
  label: string;
  /** The validation message, already translated. Absent means valid. */
  error?: string;
  /** Class for the field wrapper. The textarea keeps its own `className`. */
  fieldClassName?: string;
}

/**
 * `FormField`, for prose.
 *
 * Identical wiring — one generated id ties the label, the control and the error
 * message together — so a long field is as accessible as a short one without
 * the form having to arrange it again. It takes the textarea's props directly,
 * so `register`'s spread lands where it should.
 */
export const FormTextareaField = ({
  label,
  error,
  fieldClassName,
  className,
  id,
  ...textareaProps
}: FormTextareaFieldProps) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;

  return (
    <div className={cn('grid gap-2', fieldClassName)}>
      <label htmlFor={fieldId} className="text-sm leading-none font-medium">
        {label}
      </label>

      <Textarea
        id={fieldId}
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : errorId}
        className={className}
        {...textareaProps}
      />

      {error !== undefined && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
};