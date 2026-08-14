/// <reference types="vite/client" />

/**
 * The environment variables this application reads, declared so a typo is a
 * compile error rather than an `undefined` that only shows up at runtime.
 *
 * Every entry is optional: each has a working default at its point of use, so
 * the app runs with no `.env` file at all. See `.env.example` for what they
 * mean and `src/lib/env.ts` for the defaults.
 */
interface ImportMetaEnv {
  /** Origin the API is served from. Empty (the default) means same-origin. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
