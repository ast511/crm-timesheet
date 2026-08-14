import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { Suspense, type ReactNode } from 'react';

import { ErrorBoundary } from './ErrorBoundary';
import { QueryErrorState } from './QueryErrorState';

export interface QueryBoundaryProps {
  children: ReactNode;
  /**
   * The skeleton for what is loading — shaped like the real thing, so the page
   * does not move when the data arrives.
   */
  fallback: ReactNode;
}

/**
 * Wraps a screen that reads data with `useSuspenseQuery`.
 *
 * A suspended query has two exits, and both need somewhere to land: while it is
 * pending it suspends into the `<Suspense>` fallback, and when it fails it
 * *throws*, which without an error boundary takes down the whole tree.
 *
 * `QueryErrorResetBoundary` is the third piece and the easy one to miss:
 * pressing "retry" has to clear the cached error as well as re-render, or the
 * boundary catches the same failure again immediately.
 *
 * ```tsx
 * <QueryBoundary fallback={<EmployeeListSkeleton />}>
 *   <EmployeeList />
 * </QueryBoundary>
 * ```
 */
export const QueryBoundary = ({ children, fallback }: QueryBoundaryProps) => (
  <QueryErrorResetBoundary>
    {({ reset }) => (
      <ErrorBoundary
        onReset={reset}
        fallback={(error, retry) => <QueryErrorState error={error} onRetry={retry} />}
      >
        <Suspense fallback={fallback}>{children}</Suspense>
      </ErrorBoundary>
    )}
  </QueryErrorResetBoundary>
);
