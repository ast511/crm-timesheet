import { CheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { CORNER_RADII, CORNER_RADIUS_REM, type CornerRadius } from '@/theme/theme';

export interface RadiusPickerProps {
  value: CornerRadius;
  onChange: (radius: CornerRadius) => void;
}

/**
 * The five corner radii, each previewing itself.
 *
 * The tile inside every option is drawn with that option's own radius, so the
 * choice is legible without reading the number under it — which matters,
 * because the numbers (`0`, `0.3`, `0.5`, `0.75`, `1.0`) are the rem values the
 * mock's design showed and mean nothing on their own.
 *
 * **The value comes from `CORNER_RADIUS_REM`**, the same map `applyTheme` writes
 * to `--radius`. The backend names a symbol and never sends a number precisely
 * so that this mapping stays a frontend decision (backend Feature 039); reading
 * it here rather than restating `0.3rem` means the preview cannot disagree with
 * what picking the option actually does.
 *
 * `CORNER_RADII` is derived from the same object, so a sixth radius appears in
 * this picker the moment the contract grows one.
 */
export const RadiusPicker = ({ value, onChange }: RadiusPickerProps) => {
  const { t } = useTranslation();

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.cornerRadius')}
      className="grid grid-cols-5 gap-2"
    >
      {CORNER_RADII.map((radius) => {
        const selected = radius === value;

        return (
          <button
            key={radius}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(radius)}
            className={cn(
              'relative flex h-16 flex-col items-center justify-center gap-1.5 rounded-md border-2 p-2 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-muted-foreground/40 hover:bg-muted/50',
            )}
          >
            <span
              aria-hidden="true"
              className="size-6 border border-border bg-background shadow-sm"
              style={{ borderRadius: CORNER_RADIUS_REM[radius] }}
            />
            <span className="font-medium">{t(`theme.radii.${radius}`)}</span>
            {selected && (
              <CheckIcon aria-hidden="true" className="absolute top-1 right-1 size-3 text-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
};
