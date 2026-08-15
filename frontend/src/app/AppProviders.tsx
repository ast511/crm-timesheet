import { QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy, type ReactNode } from 'react';

import { queryClient } from '@/api/query-client';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/theme/ThemeProvider';
// Side-effect import: registers the `403` handler on the axios interceptor.
// Like the auth feature's `401` seam it must be in place before the first
// request of the page, which is earlier than any effect runs — see the note at
// the bottom of the module.
import '@/features/permissions/permission-resync';

/**
 * Loaded lazily and only in development, so the devtools bundle never reaches a
 * production build. A plain conditional import would still be bundled — the
 * condition is evaluated at runtime, the import at build time.
 */
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then((module) => ({
        default: module.ReactQueryDevtools,
      })),
    )
  : () => null;

export interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Everything the whole application sits inside, in one place.
 *
 * The order matters in one respect: the theme is above the router, so a screen
 * can read it without a provider of its own, and server state is above both, so
 * a route loader can prefetch through the same cache the components read.
 *
 * i18n is deliberately **not** a provider here. `react-i18next` reads the
 * default instance that `@/i18n/config` initialises on import, and wrapping it
 * in `<I18nextProvider>` would add a second way to reach the same object.
 *
 * ## One `<Toaster />`, mounted once, inside the theme
 *
 * Sonner's `toast.*` is a module-level API: anything can call it from anywhere,
 * including an axios interceptor with no component in scope, and it renders
 * into whichever `<Toaster />` is mounted. There must therefore be exactly one,
 * and it lives here for the same reason the theme does — every area of the
 * application has it, and no screen has to remember to bring one.
 *
 * It is *inside* `ThemeProvider` because it reads the resolved colour mode. It
 * is *outside* the router because a toast can outlive the navigation that
 * caused it — the permission re-sync moves somebody off a page and explains why
 * afterwards, and the explanation must not unmount with the page.
 */
export const AppProviders = ({ children }: AppProvidersProps) => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      {children}
      <Toaster position="bottom-right" />
      <Suspense fallback={null}>
        <ReactQueryDevtools buttonPosition="bottom-left" />
      </Suspense>
    </ThemeProvider>
  </QueryClientProvider>
);
