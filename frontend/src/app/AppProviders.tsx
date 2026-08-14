import { QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy, type ReactNode } from 'react';

import { queryClient } from '@/api/query-client';
import { ThemeProvider } from '@/theme/ThemeProvider';

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
 */
export const AppProviders = ({ children }: AppProvidersProps) => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      {children}
      <Suspense fallback={null}>
        <ReactQueryDevtools buttonPosition="bottom-left" />
      </Suspense>
    </ThemeProvider>
  </QueryClientProvider>
);
