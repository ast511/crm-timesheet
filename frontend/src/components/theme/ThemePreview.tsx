import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

/** The five steps the primary is shown at, densest first. */
const PRIMARY_STEPS = ['bg-primary', 'bg-primary/80', 'bg-primary/60', 'bg-primary/40', 'bg-primary/20'];

/**
 * A few ordinary controls, so a choice can be seen before it is lived with.
 *
 * It needs no props and takes none. Both pickers write through
 * `ThemeProvider`, which puts the palette class and `--radius` on `<html>` — so
 * this preview is simply part of the page the change already applied to, and
 * it updates because everything does. A preview wired to a *pending* value
 * would be a second theme system rendering a second answer, which is the thing
 * the dialog above it is most at risk of becoming.
 *
 * That is also why the buttons are the real `<Button>` and not a facsimile: if
 * the preview and the application's own buttons could disagree, the preview
 * would be worthless at exactly the moment somebody relied on it.
 */
export const ThemePreview = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm">{t('theme.previewPrimary')}</Button>
        <Button size="sm" variant="outline">
          {t('theme.previewOutline')}
        </Button>
      </div>

      <div aria-hidden="true" className="flex items-center gap-2">
        {PRIMARY_STEPS.map((step) => (
          <span key={step} className={`size-3 rounded-full ${step}`} />
        ))}
      </div>
    </div>
  );
};
