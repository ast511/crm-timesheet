import { useTranslation } from 'react-i18next';

import logoDark from '@/assets/images/logo_dark.png';
import logoLight from '@/assets/images/logo_light.png';
import { cn } from '@/lib/utils';

/** The intrinsic size of both files, so the box is reserved before either loads. */
const INTRINSIC_WIDTH = 2172;
const INTRINSIC_HEIGHT = 724;

export interface AppLogoProps {
  className?: string;
}

/**
 * The wordmark, switching with the **operating system's** light/dark setting.
 *
 * ## Why `prefers-color-scheme` and not the app's theme
 *
 * This is the public area's logo, and the public area deliberately follows the
 * device rather than any stored preference — there is nobody signed in whose
 * preference it could be. So the switch is the media query itself, not the
 * `dark` class the `ThemeProvider` manages. In the `device` scope the two agree
 * by construction; using the media query says *why* they agree, and keeps this
 * component correct even if it is ever rendered outside a provider.
 *
 * ## Why `<picture>` and not two `<img>`s with `dark:hidden`
 *
 * A `<picture>` with a `media` source is resolved by the browser's preload
 * scanner: **only the matching file is fetched**, and the swap on an OS theme
 * change happens natively, with no JavaScript, no re-render, and no flash. Two
 * `<img>` elements toggled by a class would download both — and these are
 * 400 kB and 500 kB — while a single `<img>` whose `src` is chosen in React
 * would show the wrong one until hydration.
 *
 * `width`/`height` are the intrinsic pixels; the class sets the rendered
 * height. Together they give the browser the aspect ratio up front, so the
 * header does not reflow when the image arrives.
 */
export const AppLogo = ({ className }: AppLogoProps) => {
  const { t } = useTranslation();

  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet={logoDark} />
      <img
        src={logoLight}
        alt={t('app.name')}
        width={INTRINSIC_WIDTH}
        height={INTRINSIC_HEIGHT}
        className={cn('w-auto object-contain', className)}
      />
    </picture>
  );
};
