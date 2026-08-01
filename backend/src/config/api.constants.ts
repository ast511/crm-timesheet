/**
 * Single source of truth for the public shape of the REST API.
 *
 * Bootstrap, the routing configuration and the tests all derive their paths
 * from these values, so the base path can never drift between them.
 */

/** Root segment every REST endpoint is served under. */
export const API_PREFIX = 'api';

/** Segment prefix Nest puts in front of the version number (`/v1`). */
export const API_VERSION_PREFIX = 'v';

/** Version applied to controllers that do not declare one of their own. */
export const API_DEFAULT_VERSION = '1';

/** Base path of the current API version — `/api/v1`. */
export const API_BASE_PATH = `/${API_PREFIX}/${API_VERSION_PREFIX}${API_DEFAULT_VERSION}`;
