import { useSyncExternalStore } from 'react';

/** Tailwind's `md`. The width at which the sidebar stops being a sheet. */
const MOBILE_BREAKPOINT = 768;

const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/*
 * Rewritten from the registry version (F05), for two reasons — the second of
 * which is the one that shows on screen.
 *
 * **It failed `react-hooks/set-state-in-effect`.** The registry hook mirrors a
 * media query into `useState` from a `useEffect`, which this project's ESLint
 * configuration rejects and `theme/theme.ts` already avoids for the same
 * external value: `prefers-color-scheme` is read with `useSyncExternalStore`
 * there, and the viewport width is the same kind of thing — genuinely external
 * state that changes on its own.
 *
 * **It was wrong on the first render.** The registry version starts at
 * `undefined` and coerces that to `false`, so a phone renders one frame of the
 * desktop layout before the effect corrects it — for this component that means
 * the sidebar mounts as a rail and then becomes a sheet. `useSyncExternalStore`
 * reads the real value during the first render and there is no frame to be
 * wrong in.
 *
 * Both halves are declared at module level so their identity is stable; an
 * inline arrow would re-subscribe on every render.
 */

const subscribe = (onChange: () => void): (() => void) => {
  const query = window.matchMedia(MOBILE_MEDIA_QUERY);

  query.addEventListener('change', onChange);

  return () => query.removeEventListener('change', onChange);
};

const getSnapshot = (): boolean => window.matchMedia(MOBILE_MEDIA_QUERY).matches;

/** Whether the viewport is narrower than Tailwind's `md` breakpoint. */
export const useIsMobile = (): boolean => useSyncExternalStore(subscribe, getSnapshot);
