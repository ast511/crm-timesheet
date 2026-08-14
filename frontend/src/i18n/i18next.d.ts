import 'i18next';

import type common from '@/locales/ro/common.json';
import type errors from '@/locales/ro/errors.json';

/**
 * Types `t()` against the `ro` bundles, so a mistyped key is a compile error
 * instead of the key name rendered on screen.
 *
 * `ro` is the reference because it is the default language and the one every
 * other bundle is checked against in `config.ts`.
 *
 * The one place this is deliberately bypassed is `useApiErrorMessage`, where
 * the key comes from the backend at runtime and the catalogue is knowingly
 * incomplete — see the note there.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      errors: typeof errors;
    };
  }
}
