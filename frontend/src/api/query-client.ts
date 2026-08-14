import { QueryClient } from '@tanstack/react-query';

import { isApiError } from './api-error';

/**
 * Server state defaults for the whole application.
 *
 * They are set once here rather than per query, so a screen only overrides what
 * is genuinely different about *its* data — a work schedule that changes twice
 * a year should say so; a timesheet list should not have to restate the norm.
 */

/** Attempts after the first failure. Three requests in total, at most. */
const MAX_RETRIES = 2;

/** How long a fetched result is served without a background refetch. */
const STALE_TIME_MS = 30_000;

/**
 * Retry only what a retry can fix.
 *
 * Every `4xx` is final: the request will be refused again unchanged. That
 * deliberately includes the ones a naive policy retries —
 *
 * - `401` is the interceptor's business, not the query's. It has already had
 *   its one refresh-and-retry by the time the error arrives here.
 * - `403` is a permission the person does not have; asking three times does not
 *   grant it.
 * - `429` is the rate limiter, and the backend is explicit that retrying into
 *   it *extends* the block rather than shortening it. A retry here would turn
 *   one refused request into three and lengthen the wait.
 *
 * What is left — a network failure, a `5xx` — is transient by nature, and those
 * are retried.
 */
const retry = (failureCount: number, error: unknown): boolean => {
  if (failureCount >= MAX_RETRIES) return false;
  if (isApiError(error) && error.isClientError) return false;

  return true;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_MS,
      retry,
      /**
       * Off. This is an internal application people leave open beside their
       * other work; refetching every list each time the window regains focus
       * would be a burst of requests nobody asked for, and the data it guards
       * against — a colleague editing the same record — is rare enough to be
       * handled by an explicit refresh and by invalidation after mutations.
       */
      refetchOnWindowFocus: false,
    },
    mutations: {
      /**
       * Never. A mutation is not idempotent: a retried `POST` can create a
       * second record, and the client cannot tell a request that failed from
       * one whose *response* failed.
       */
      retry: false,
    },
  },
});

/**
 * SEAM (later feature): global error reporting.
 *
 * Every error reaching a query or a mutation is an `ApiError` with a translated
 * message available through `useApiErrorMessage`. When a toast component
 * exists, attach a `QueryCache`/`MutationCache` `onError` here so unhandled
 * failures surface once, centrally, instead of each screen growing its own
 * `onError`. Left out for now rather than stubbed, because a handler with
 * nowhere to render is worse than no handler.
 */
