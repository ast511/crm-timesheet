import type { components } from '@/api/generated/openapi';

/**
 * The theme's two server-stored inputs, plus the one that stays on the device.
 *
 * ## Where the types come from
 *
 * `ColorScheme` and `CornerRadius` are **read out of the generated contract**,
 * not written here. They are the enums backend Feature 039 stores on the
 * account and returns from `GET /api/v1/profile/me`, so a palette added or
 * removed on the server becomes a compile error in this file rather than a
 * value the UI silently cannot render.
 */

export type ColorScheme = components['schemas']['ProfileAccount']['colorScheme'];
export type CornerRadius = components['schemas']['ProfileAccount']['cornerRadius'];

/**
 * Palette → the class put on `<html>`, which is what the `.theme-*` blocks at
 * the bottom of `index.css` select on.
 *
 * A `Record` keyed by the generated union rather than a hand-kept array: adding
 * a ninth palette to the backend fails the build here until it is given a
 * class, which is the only way a list like this stays complete. This object is
 * the single source of truth — {@link PALETTE_CLASSES} is derived from it, so
 * adding a palette is one edit here plus its block in `index.css`.
 *
 * **`DEFAULT` maps to `null`, and that is not a missing value.** The default
 * palette IS the `:root` / `.dark` base already declared in `index.css`; giving
 * it a class would mean restating every one of those variables a second time.
 * So `DEFAULT` means "wear no palette class and let the base show through".
 */
export const COLOR_SCHEME_CLASS: Record<ColorScheme, string | null> = {
  DEFAULT: null,
  RED: 'theme-red',
  ROSE: 'theme-rose',
  ORANGE: 'theme-orange',
  GREEN: 'theme-green',
  BLUE: 'theme-blue',
  YELLOW: 'theme-yellow',
  VIOLET: 'theme-violet',
};

/**
 * Every palette class, for removal before the chosen one is added.
 *
 * Derived rather than written out: a hand-kept second list is how a palette
 * ends up impossible to switch *away* from, and that failure is invisible until
 * somebody picks a second colour.
 */
const PALETTE_CLASSES: string[] = Object.values(COLOR_SCHEME_CLASS).filter(
  (className): className is string => className !== null,
);

/**
 * Symbol → `--radius`, in rem.
 *
 * **This mapping is the frontend's**, and the backend says so explicitly: the
 * API names which of the five was chosen and never sends a number, because a
 * number in the database would freeze a CSS decision there. The values below
 * are the ones documented in `backend/FEATURES/039-user-ui-preferences.md`,
 * `schema.prisma` and the OpenAPI description — if they ever disagree, that
 * document is the reference.
 *
 * | Symbol   | `--radius` |
 * | -------- | ---------- |
 * | `NONE`   | `0rem`     |
 * | `SMALL`  | `0.3rem`   |
 * | `MEDIUM` | `0.5rem`   |
 * | `LARGE`  | `0.75rem`  |
 * | `FULL`   | `1rem`     |
 *
 * Every other radius in the application is derived from this one variable —
 * `--radius-sm` through `--radius-4xl` are multiples of it, set in `index.css`
 * — so one property changes the roundness of every card, input and button.
 */
export const CORNER_RADIUS_REM: Record<CornerRadius, string> = {
  NONE: '0rem',
  SMALL: '0.3rem',
  MEDIUM: '0.5rem',
  LARGE: '0.75rem',
  FULL: '1rem',
};

/** Both lists, in the order a settings screen should offer them. */
export const COLOR_SCHEMES = Object.keys(COLOR_SCHEME_CLASS) as ColorScheme[];
export const CORNER_RADII = Object.keys(CORNER_RADIUS_REM) as CornerRadius[];

/** The backend's column defaults, restated so the UI can render before it reads. */
export const DEFAULT_COLOR_SCHEME: ColorScheme = 'DEFAULT';
export const DEFAULT_CORNER_RADIUS: CornerRadius = 'MEDIUM';

/**
 * Light/dark. **Client-only, and never sent to the backend.**
 *
 * There is no column for it and there is not going to be one: light versus dark
 * is a property of where somebody is sitting rather than of who they are, the
 * operating system already knows through `prefers-color-scheme`, and a stored
 * value would exist to contradict the machine. The colour scheme is different —
 * nothing on the device has an opinion about violet — which is exactly why one
 * is stored and the other is not.
 */
export type ColorMode = 'light' | 'dark' | 'system';

/** What `system` actually resolved to. This is what gets applied. */
export type ResolvedColorMode = 'light' | 'dark';

export const COLOR_MODES: ColorMode[] = ['light', 'dark', 'system'];

/** `system` — follow the operating system until somebody says otherwise. */
export const DEFAULT_COLOR_MODE: ColorMode = 'system';

/**
 * Where the colour mode is remembered.
 *
 * `localStorage` is right here and wrong for the access token, and the
 * difference is what is at stake: a stolen "prefers dark" is not an incident.
 * The key is duplicated once, in the inline script in `index.html`, which
 * applies the stored mode before the first paint so the page does not flash the
 * wrong theme. That duplication is deliberate — the script has to run before
 * any module loads — and it is the only copy.
 */
export const COLOR_MODE_STORAGE_KEY = 'crm-timesheet.color-mode';

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

/**
 * The two halves of `useSyncExternalStore` for the operating system's setting.
 *
 * Declared at module level so both references are stable — React re-subscribes
 * whenever `subscribe` changes identity, and an inline arrow would do that on
 * every render.
 */
export const subscribeToSystemColorScheme = (onChange: () => void): (() => void) => {
  const query = window.matchMedia(DARK_MEDIA_QUERY);

  query.addEventListener('change', onChange);

  return () => query.removeEventListener('change', onChange);
};

export const getSystemColorMode = (): ResolvedColorMode =>
  window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';

const isColorMode = (value: unknown): value is ColorMode =>
  typeof value === 'string' && (COLOR_MODES as string[]).includes(value);

export const readStoredColorMode = (): ColorMode => {
  try {
    const stored = window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);

    return isColorMode(stored) ? stored : DEFAULT_COLOR_MODE;
  } catch {
    return DEFAULT_COLOR_MODE;
  }
};

export const storeColorMode = (mode: ColorMode): void => {
  try {
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage disabled. The choice applies to this session and is not kept.
  }
};

/**
 * Writes the whole theme onto `<html>` in one place.
 *
 * Three separate mechanisms, because the three inputs are genuinely different:
 * the palette is a set of CSS variables selected by a class, the radius is a
 * single variable with a computed value, and light/dark is the class Tailwind's
 * `dark:` variant keys on. `color-scheme` goes along with the last one so
 * scrollbars and native form controls follow too.
 *
 * The palette class and `dark` land on the SAME element, which is what lets the
 * stylesheet combine them as `.dark.theme-violet`. Both therefore belong on
 * `<html>` — putting `dark` on `<html>` and the palette on `<body>` would leave
 * every dark palette variant unmatched.
 *
 * `--radius` is set as an inline style, so it overrides the fixed `--radius` in
 * `:root`. The whole `--radius-sm` / `md` / `lg` / `xl` chain is derived from it
 * in `index.css`, so this one property changes the roundness of every card,
 * input and button. Until a preference is applied the `:root` value stands.
 */
export const applyTheme = (theme: {
  colorScheme: ColorScheme;
  cornerRadius: CornerRadius;
  resolvedColorMode: ResolvedColorMode;
}): void => {
  const root = document.documentElement;
  const paletteClass = COLOR_SCHEME_CLASS[theme.colorScheme];

  root.classList.remove(...PALETTE_CLASSES);

  if (paletteClass !== null) {
    root.classList.add(paletteClass);
  }

  root.style.setProperty('--radius', CORNER_RADIUS_REM[theme.cornerRadius]);
  root.classList.toggle('dark', theme.resolvedColorMode === 'dark');
  root.style.colorScheme = theme.resolvedColorMode;
};
