import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { LEAVE_TYPE_ICON_OPTIONS, leaveTypeIcon } from '../leave-type-icons';

export interface LeaveTypeIconFieldProps {
  label: string;
  value: string;
  onChange: (icon: string) => void;
  error?: string;
}

/**
 * The icon picker: a closed list, shown as glyphs rather than as names.
 *
 * `icon` is required on a leave type — every one of them is drawn in a list and
 * on a calendar, so the API treats an icon as part of what a leave type *is*
 * rather than as decoration. A free text field would let somebody store
 * `umbrela` and discover the broken glyph on somebody else's screen; a picker
 * of the vocabulary this application actually ships cannot produce one.
 *
 * The selected value is rendered as the glyph beside its name, so the choice is
 * verifiable without opening the list — the same thing the row will look like.
 */
export const LeaveTypeIconField = ({
  label,
  value,
  onChange,
  error,
}: LeaveTypeIconFieldProps) => {
  const { t } = useTranslation();
  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  return (
    <div className="grid gap-2">
      <label htmlFor={fieldId} className="text-sm leading-none font-medium">
        {label}
      </label>

      <Select value={value} onValueChange={(next) => onChange(next ?? '')}>
        <SelectTrigger
          id={fieldId}
          aria-label={label}
          aria-invalid={error !== undefined}
          aria-describedby={error === undefined ? undefined : errorId}
          className="w-full"
        >
          <SelectValue>
            {(selected: string | null) => {
              const name = selected ?? '';
              const Icon = leaveTypeIcon(name);
              const option = LEAVE_TYPE_ICON_OPTIONS.find((entry) => entry.name === name);

              return (
                <span className="flex items-center gap-2">
                  <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                  {option === undefined ? name : t(option.labelKey)}
                </span>
              );
            }}
          </SelectValue>
        </SelectTrigger>

        <SelectContent>
          {LEAVE_TYPE_ICON_OPTIONS.map((option) => (
            <SelectItem key={option.name} value={option.name}>
              <option.icon aria-hidden="true" className="size-4 text-muted-foreground" />
              {t(option.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error !== undefined && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
};