import { createRoute } from '@tanstack/react-router';

import { WorkspacePlaceholderPage } from '@/app/pages/WorkspacePlaceholderPage';
import { requirePermission } from '@/features/permissions/permission-route-guard';

import { workspaceRoute } from './workspace.route';

/**
 * The personal workspace: the signed-in person's own timesheet and leave
 * requests. With the dashboard at `/app` itself, that is the whole of it, and
 * the whole of it is **the same for every role** — see `PERSONAL_NAVIGATION` in
 * `features/workspace/navigation.ts` for why that is a rule rather than a
 * coincidence.
 *
 * ## Two routes were removed from this file
 *
 * `/app/projects` and `/app/public-holidays` were standalone personal screens,
 * gated on `PROJECTS.PAGE_ACCESS` and `PUBLIC_HOLIDAYS.PAGE_ACCESS`. They are
 * gone rather than merely unlinked, and deleting them was the honest option:
 * nothing in the application pointed at either, both were placeholders, and both
 * duplicated a screen that already exists on the team side at
 * `/app/team/settings/projects` and `/app/team/settings/public-holidays`. A
 * route reachable only by typing its URL is a route nobody maintains — it keeps
 * a guard, a title and a translation alive to serve a page no product decision
 * still stands behind.
 *
 * They also had no work left to do. Choosing a project happens **inside** the
 * timesheet, from an ungated list; public holidays are pre-filled into a
 * timesheet by the backend. Neither ever needed a page of its own.
 *
 * A direct navigation to either path now falls through to the router's
 * not-found handling, which is the correct answer for an address this
 * application no longer has — better than a guard's "not authorized", which
 * would have implied the page exists and is being withheld.
 *
 * ## The rest
 *
 * These hang directly off `/app` with no path segment of their own, which is the
 * other half of the rule in `features/workspace/workspace.ts`: the team
 * workspace is everything under `/app/team`, and the personal workspace is
 * everything else. A screen is in one or the other by where it is declared, and
 * there is no third place to declare one.
 *
 * **Each guard states the same requirement its menu item does** — see
 * `features/workspace/navigation.ts`. F04's `requirePermission` and `<Can>`
 * answer with the same `satisfies`, so the pair cannot disagree; writing it
 * twice is the cost of the guard being synchronous and the menu being a
 * component. The alternative — deriving one from the other — would put the
 * route tree and the navigation config in an import cycle for a saving of
 * twelve lines.
 *
 * The screens are placeholders. F05 owns the shell, not the features.
 */

export const timesheetRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/timesheet',
  beforeLoad: requirePermission({ permission: 'TIMESHEET.PAGE_ACCESS' }),
  component: () => (
    <WorkspacePlaceholderPage
      titleKey="pages.timesheet.title"
      descriptionKey="pages.timesheet.description"
    />
  ),
});

export const leaveRequestsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/leave-requests',
  beforeLoad: requirePermission({ permission: 'LEAVE_REQUESTS.PAGE_ACCESS' }),
  component: () => (
    <WorkspacePlaceholderPage
      titleKey="pages.leaveRequests.title"
      descriptionKey="pages.leaveRequests.description"
    />
  ),
});
