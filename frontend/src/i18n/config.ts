import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from '@/locales/en/common.json';
import enErrors from '@/locales/en/errors.json';
import roCommon from '@/locales/ro/common.json';
import roErrors from '@/locales/ro/errors.json';

/**
 * Internationalisation, with **`ro` as the language and `en` as the fallback**.
 *
 * ## Two namespaces, and the second one is a contract
 *
 * - `common` — everything this application writes itself.
 * - `errors` — one key per backend error code, spelled exactly as the API sends
 *   it: `errors:AUTH_UNAUTHENTICATED`.
 *
 * The second is why the split exists. The backend's envelope carries an
 * `errorCode` and a `message`, and the message is English written for a log —
 * it is explicitly free to be reworded and must never be rendered. The code is
 * the stable half, so it *is* the translation key, and `params` from the same
 * envelope are the interpolation values:
 *
 * ```jsonc
 * // the envelope
 * { "errorCode": "AUTHORIZATION_PERMISSION_DENIED",
 *   "params": { "requiredPermissions": "employees.read" } }
 * ```
 * ```jsonc
 * // locales/ro/errors.json
 * { "AUTHORIZATION_PERMISSION_DENIED": "Nu ai permisiunea necesară ({{requiredPermissions}})." }
 * ```
 *
 * `useApiErrorMessage` is the only thing that performs that lookup.
 *
 * The catalogue is **deliberately incomplete**: four codes plus the two that
 * this foundation already had a use for. The backend has around fifteen and
 * will grow more, and a code arrives here with the feature that can produce it.
 * A missing key falls back to the status, then to a generic sentence — never to
 * the raw English message.
 *
 * Reserved lowercase keys (`fallback.*`, and `field.*` for the sentence a
 * rejected input carries — see `useServerFieldErrors`) cannot collide with a
 * code, because every backend code is SCREAMING_SNAKE_CASE.
 */

export const LANGUAGES = ['ro', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'ro';
export const FALLBACK_LANGUAGE: Language = 'en';

export const DEFAULT_NAMESPACE = 'common';
export const ERRORS_NAMESPACE = 'errors';

/**
 * Where the chosen language is remembered.
 *
 * `localStorage`, like the colour mode and unlike the access token: a language
 * preference is not a credential, and losing it on every reload would be worse
 * than the nothing an attacker gains by reading it. It is also **not** sent to
 * the backend — there is no `language` column and backend Feature 039 argues
 * against inventing one before something reads it.
 */
const LANGUAGE_STORAGE_KEY = 'crm-timesheet.language';

const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);

const readStoredLanguage = (): Language => {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);

    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    // Private mode, or storage disabled by policy. The default is not worth
    // failing a page load over.
    return DEFAULT_LANGUAGE;
  }
};

export const storeLanguage = (language: Language): void => {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Same as above: the choice applies to this session and is simply not kept.
  }
};

/**
 * `ro` is the source of truth for the shape of every bundle. `satisfies` makes
 * a key added to `ro` and forgotten in `en` a compile error rather than a
 * screen that silently prints the key name.
 */
const resources = {
  ro: { common: roCommon, errors: roErrors },
  en: { common: enCommon, errors: enErrors },
} satisfies Record<Language, { common: typeof roCommon; errors: typeof roErrors }>;

void i18n.use(initReactI18next).init({
  resources,
  lng: readStoredLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  defaultNS: DEFAULT_NAMESPACE,
  ns: [DEFAULT_NAMESPACE, ERRORS_NAMESPACE],
  interpolation: {
    // React escapes everything it renders; doing it again here would turn an
    // apostrophe in a department name into `&#39;` on screen.
    escapeValue: false,
  },
});

export { i18n };
