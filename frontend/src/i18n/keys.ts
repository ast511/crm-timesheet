import type { ParseKeys } from 'i18next';

/**
 * Every key in the `common` bundle, as a union.
 *
 * `i18next.d.ts` already types `t('…')` against the `ro` bundle, which catches a
 * mistyped key *at the call site*. This is the same union in a form that can be
 * stored: a configuration object that names a string to translate later — the
 * navigation items in `features/workspace/navigation.ts`, and the page titles
 * the routes hand to `WorkspacePlaceholderPage` — declares its field as this
 * rather than as `string`, so a renamed or deleted key fails the build in the
 * config instead of rendering `pages.employees.title` in the sidebar.
 *
 * It is derived from the same `CustomTypeOptions` declaration, so there is one
 * catalogue and no list kept by hand.
 */
export type CommonKey = ParseKeys<'common'>;
