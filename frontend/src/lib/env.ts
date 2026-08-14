/**
 * Environment values, read once and given their defaults here rather than at
 * each point of use.
 *
 * `VITE_OPENAPI_URL` and `VITE_API_PROXY_TARGET` are deliberately absent: the
 * first is read by `scripts/gen-api.mjs` and the second by `vite.config.ts`.
 * Neither is needed in the browser, and a variable that never reaches the
 * bundle is one less thing shipped to a user.
 */

/**
 * Origin the API is served from. **Empty means same-origin**, which is the
 * default and the arrangement both environments use: in development the Vite
 * proxy forwards `/api` to the NestJS process, in production a reverse proxy
 * serves both applications from one origin. Neither makes a cross-origin
 * request, so there is no CORS configuration on either side.
 *
 * It is an *origin* and not a path prefix, which is the one thing worth reading
 * twice. `/api/v1` is part of every path in the OpenAPI document, so the typed
 * client already sends it; putting it here as well would send `/api/v1/api/v1/…`.
 * More importantly, the version belongs to the path rather than to the
 * deployment — the document describes every version the API serves, and the day
 * a `/api/v2/...` route appears it has to be reachable through the same client.
 *
 * Set an absolute origin (`https://api.example.com`) only when the API genuinely
 * lives somewhere else.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
