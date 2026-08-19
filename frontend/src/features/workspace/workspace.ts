/**
 * The two workspaces, and the rule that decides which one is open.
 *
 * A workspace is **whose work the screen is about**: `personal` is the
 * signed-in person's own timesheet, leave and calendar; `team` is everybody
 * else's — the employee directory, the approvals, the configuration. The mock
 * this was ported from called the same idea a "view" and drove it from a role;
 * here it is a property of the URL, and the navigation for it is filtered by
 * permissions (F04).
 *
 * ## It is derived from the path, not stored beside it
 *
 * The mock kept the current view in a `useState` inside `ViewContext`. That
 * works until the two disagree, and there are two ordinary ways to make them:
 *
 * - **A link.** Somebody opens `/app/team/employees` from an email. The state
 *   says `personal`, so the sidebar offers the personal menu while a team
 *   screen is on display, and the switcher claims to be somewhere it is not.
 * - **A demotion.** F04's re-sync moves a demoted administrator off a team
 *   screen to `/app/not-authorized`. Stored state would still say `team`, and
 *   would need an effect watching the permission set to put it back —
 *   a second mechanism doing what the redirect already did.
 *
 * Deriving it removes both cases rather than handling them. There is exactly
 * one source of truth for where somebody is, it is the address bar, and
 * switching workspace *is* a navigation.
 */

/** The path every team screen hangs off. The prefix is the whole rule. */
export const TEAM_PATH_PREFIX = '/app/team';

/** Where each workspace starts. `/app/team` resolves to the first team screen
 *  the person may open — see `team.routes.tsx`. */
export const PERSONAL_ENTRY_ROUTE = '/app';
export const TEAM_ENTRY_ROUTE = TEAM_PATH_PREFIX;

export type Workspace = 'personal' | 'team';

export const WORKSPACES: readonly Workspace[] = ['personal', 'team'];

/**
 * Which workspace a path belongs to.
 *
 * Mirrors `isAccountThemePath` in `theme/theme.ts` deliberately — same shape,
 * same reason: a prefix covers every screen added later without enumerating
 * them, and the exact-match arm is what keeps `/app/teamwork` (were there ever
 * such a screen) out of the team workspace.
 */
export const workspaceForPath = (pathname: string): Workspace =>
  pathname === TEAM_PATH_PREFIX || pathname.startsWith(`${TEAM_PATH_PREFIX}/`)
    ? 'team'
    : 'personal';
