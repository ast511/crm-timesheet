import { useContext } from 'react';

import { WorkspaceContext, type WorkspaceContextValue } from './workspace-context';

/**
 * The current workspace, its menu, and the way to the other one.
 *
 * Kept in its own file so `WorkspaceProvider.tsx` exports only a component,
 * which is what keeps React Fast Refresh working for it — the same arrangement
 * `theme/useTheme.ts` uses.
 */
export const useWorkspace = (): WorkspaceContextValue => {
  const context = useContext(WorkspaceContext);

  if (context === null) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider.');
  }

  return context;
};
