import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';

import { useTheme } from '@/theme/useTheme';

/**
 * The application's single toast surface — `npx shadcn add sonner`, with one
 * substitution.
 *
 * ## It reads *this* project's theme, not `next-themes`
 *
 * shadcn's registry entry imports `useTheme` from `next-themes`, because the
 * registry is written for Next.js. This project is Vite + TanStack Router and
 * has its own `ThemeProvider`, so the import points there instead — and
 * `next-themes` was uninstalled rather than left in `package.json` as a second,
 * unused theme system nothing renders.
 *
 * The value it needs is {@link ThemeContextValue.resolvedColorMode}, not
 * `colorMode`. `colorMode` may be `system`, which Sonner would then resolve for
 * itself against `prefers-color-scheme` — and that is precisely the question
 * the theme layer already answers differently: on a public screen the `device`
 * scope ignores a stored preference, so the two would disagree and a toast
 * would be the one dark panel on a light login page. Passing the *resolved*
 * mode means the toast is whatever is actually on screen, by construction.
 *
 * Colours come from the same CSS variables as every other surface, so a chosen
 * palette and corner radius apply here without this file knowing what they are.
 */
export const Toaster = (props: ToasterProps) => {
  const { resolvedColorMode } = useTheme();

  return (
    <SonnerToaster
      theme={resolvedColorMode}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as CSSProperties
      }
      toastOptions={{ classNames: { toast: 'cn-toast' } }}
      {...props}
    />
  );
};
