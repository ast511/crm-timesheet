import { createContext } from 'react';

import type { NavItem } from './navigation';
import type { Workspace } from './workspace';

export interface WorkspaceContextValue {
  /** Which workspace the current screen belongs to. Derived from the path. */
  workspace: Workspace;
  /**
   * Whether there is a second workspace to switch to.
   *
   * `false` for a plain employee, and for an administrator the moment they stop
   * being one — F04's re-sync replaces the permission set, this recomputes, and
   * the switcher stops offering a workspace whose every screen would refuse
   * them. Nothing here watches for the demotion; it is a value derived from a
   * set that changed.
   */
  canUseTeam: boolean;
  /** The current workspace's items, already filtered by permission. */
  navigation: readonly NavItem[];
  /**
   * Open the other workspace.
   *
   * A navigation, not a state change — see `workspace.ts` for why the workspace
   * is read off the URL rather than stored beside it. Asking for `team` without
   * {@link canUseTeam} does nothing.
   */
  switchWorkspace: (workspace: Workspace) => void;
}

/**
 * `null` until a `WorkspaceProvider` is above the consumer, which in practice
 * means "outside the authenticated shell" — `useWorkspace` turns that into a
 * clear error rather than a menu quietly rendering as if nobody had any
 * permissions.
 */
export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
