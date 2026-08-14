import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Rendered instead of the children once something below has thrown. */
  fallback: (error: unknown, reset: () => void) => ReactNode;
  /** Called alongside `reset`, so a query cache can be reset at the same time. */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: unknown;
  hasError: boolean;
}

const INITIAL_STATE: ErrorBoundaryState = { error: null, hasError: false };

/**
 * Catches what a suspended query throws.
 *
 * **The one class component in this application.** Everything else is an arrow
 * function, as the conventions require — but `componentDidCatch` and
 * `getDerivedStateFromError` have no hook equivalent, and React still offers
 * none. Adding `react-error-boundary` would be a dependency for forty lines.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = INITIAL_STATE;

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error, hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // The console is the reporting target for now. When error reporting is
    // wired up, this is the one place it hooks into.
    console.error('Unhandled error in the component tree', error, info.componentStack);
  }

  reset = (): void => {
    this.props.onReset?.();
    this.setState(INITIAL_STATE);
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback(this.state.error, this.reset);
    }

    return this.props.children;
  }
}
