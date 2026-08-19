import { createRoute } from '@tanstack/react-router';

import { WorkspacePlaceholderPage } from '@/app/pages/WorkspacePlaceholderPage';
import { requirePermission } from '@/features/permissions/permission-route-guard';

import { workspaceRoute } from './workspace.route';

/**
 * The personal workspace: the signed-in person's own timesheet, leave requests,
 * projects and holiday calendar.
 *
 * They hang directly off `/app` with no path segment of their own, which is the
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

export const projectsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/projects',
  beforeLoad: requirePermission({ permission: 'PROJECTS.PAGE_ACCESS' }),
  component: () => (
    <WorkspacePlaceholderPage
      titleKey="pages.projects.title"
      descriptionKey="pages.projects.description"
    />
  ),
});

export const publicHolidaysRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/public-holidays',
  beforeLoad: requirePermission({ permission: 'PUBLIC_HOLIDAYS.PAGE_ACCESS' }),
  component: () => (
    <WorkspacePlaceholderPage
      titleKey="pages.publicHolidays.title"
      descriptionKey="pages.publicHolidays.description"
    />
  ),
});
