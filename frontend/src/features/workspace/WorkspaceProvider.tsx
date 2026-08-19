import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useCallback, useMemo, type ReactNode } from 'react';

import { usePermissions } from '@/features/permissions/usePermissions';

import { canUseTeamWorkspace, getNavigation } from './navigation';
import { WorkspaceContext } from './workspace-context';
import {
  PERSONAL_ENTRY_ROUTE,
  TEAM_ENTRY_ROUTE,
  workspaceForPath,
  type Workspace,
} from './workspace';

export interface WorkspaceProviderProps {
  children: ReactNode;
}

/**
 * Resolves the current workspace and the menu that goes with it.
 *
 * It holds no state. Both inputs are things that already exist and already
 * change on their own — the router's location and F04's permission set — and
 * everything this provider exposes is derived from them:
 *
 * ```
 * location.pathname  ─→ workspace
 * permission set     ─┴→ navigation ─→ canUseTeam
 * ```
 *
 * That is what makes the mid-session demotion require no code. F04's re-sync
 * refetches the set, `usePermissions` re-renders every subscriber, and this
 * recomputes: the team menu empties, `canUseTeam` goes false, the switcher
 * loses its second entry. Meanwhile the route guard has already moved the
 * person to `/app/not-authorized`, which is not under `/app/team`, so the
 * workspace reads `personal` again by the same derivation. Two mechanisms, no
 * synchronisation between them, because neither one stores anything.
 *
 * The subscription is narrowed to `location.pathname` through the router's
 * `select`, so a change of search parameters — `?required=` on the refusal
 * screen, for one — does not re-render the whole shell.
 */
export const WorkspaceProvider = ({ children }: WorkspaceProviderProps) => {
  const navigate = useNavigate();
  const { permissions } = usePermissions();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const workspace = workspaceForPath(pathname);
  const canUseTeam = canUseTeamWorkspace(permissions);

  const navigation = useMemo(
    () => getNavigation(permissions, workspace),
    [permissions, workspace],
  );

  const switchWorkspace = useCallback(
    (next: Workspace) => {
      if (next === 'team' && !canUseTeam) return;

      void navigate({ to: next === 'team' ? TEAM_ENTRY_ROUTE : PERSONAL_ENTRY_ROUTE });
    },
    [canUseTeam, navigate],
  );

  const value = useMemo(
    () => ({ workspace, canUseTeam, navigation, switchWorkspace }),
    [workspace, canUseTeam, navigation, switchWorkspace],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};
