import { createRoute, redirect } from '@tanstack/react-router';

import { WorkspacePlaceholderPage } from '@/app/pages/WorkspacePlaceholderPage';
import { requirePermission } from '@/features/permissions/permission-route-guard';
import { firstRouteOf } from '@/features/workspace/navigation';
import { PERSONAL_ENTRY_ROUTE } from '@/features/workspace/workspace';

import { workspaceRoute } from './workspace.route';

/**
 * The team workspace: everybody else's work, under `/app/team`.
 *
 * The prefix is load-bearing rather than cosmetic. `workspaceForPath` reads it
 * to decide which workspace is open, so a screen put here is in the team
 * workspace by construction — the switcher, the menu and the header all follow
 * from the address, and no component has to be told which mode it is in.
 *
 * `teamRoute` itself declares no guard and no component. A guard here would be
 * a third answer to "who is an administrator", competing with the per-screen
 * requirements and with `canUseTeamWorkspace`; without one, an employee who
 * types `/app/team/employees` is refused by that screen's own requirement and
 * lands on `/app/not-authorized`, which is the same refusal any other route
 * gives and needs no special case.
 */
export const teamRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/team',
});

/**
 * `/app/team` — the workspace's front door, which is a redirect.
 *
 * It exists so the switcher, a bookmark and a colleague's link all have one
 * address to aim at, while the screen they land on is chosen per account: an HR
 * lead holds no `REPORTS.PAGE_ACCESS`, and an administrator on `Admin - Limited`
 * holds none of the seven settings keys, so any *fixed* landing page would
 * refuse some of the people entitled to the workspace.
 *
 * `firstRouteOf` reads the same filtered menu the sidebar renders, so the
 * landing screen is always the first item the person can actually see. When
 * nothing is visible — a plain employee, or an administrator demoted a moment
 * ago — there is no team workspace to enter and the personal one is where they
 * belong. That is why this redirects rather than refuses: `/app/team` is not a
 * screen somebody lacks permission for, it is a signpost to screens, and a
 * signpost pointing at nothing should point home.
 *
 * `replace` keeps it out of the history, so the back button returns to wherever
 * the person came from rather than through the redirect again.
 */
export const teamIndexRoute = createRoute({
  getParentRoute: () => teamRoute,
  path: '/',
  beforeLoad: ({ context }) => {
    throw redirect({
      to: firstRouteOf(context.permissions, 'team') ?? PERSONAL_ENTRY_ROUTE,
      replace: true,
    });
  },
});

export const teamTimesheetsRoute = createRoute({
  getParentRoute: () => teamRoute,
  path: '/timesheets',
  beforeLoad: requirePermission({ permission: 'TIMESHEET.APPROVE' }),
  component: () => (
    <WorkspacePlaceholderPage
      titleKey="pages.teamTimesheets.title"
      descriptionKey="pages.teamTimesheets.description"
    />
  ),
});

export const employeesRoute = createRoute({
  getParentRoute: () => teamRoute,
  path: '/employees',
  beforeLoad: requirePermission({ permission: 'EMPLOYEES.PAGE_ACCESS' }),
  component: () => (
    <WorkspacePlaceholderPage
      titleKey="pages.employees.title"
      descriptionKey="pages.employees.description"
    />
  ),
});

export const teamLeaveRequestsRoute = createRoute({
  getParentRoute: () => teamRoute,
  path: '/leave-requests',
  beforeLoad: requirePermission({ permission: 'LEAVE_REQUESTS.APPROVE' }),
  component: () => (
    <WorkspacePlaceholderPage
      titleKey="pages.teamLeaveRequests.title"
      descriptionKey="pages.teamLeaveRequests.description"
    />
  ),
});

export const reportsRoute = createRoute({
  getParentRoute: () => teamRoute,
  path: '/reports',
  beforeLoad: requirePermission({ permission: 'REPORTS.PAGE_ACCESS' }),
  component: () => (
    <WorkspacePlaceholderPage
      titleKey="pages.reports.title"
      descriptionKey="pages.reports.description"
    />
  ),
});

/*
 * The settings group. It has no route of its own — `Setări` is a collapsible in
 * the sidebar and a popover when the sidebar is collapsed, never a link — so
 * there is no `/app/team/settings` index here and nothing points at one.
 */

export const settingsProjectsRoute = createRoute({
  getParentRoute: () => teamRoute,
  path: '/settings/projects',
  beforeLoad: requirePermission({ permission: 'PROJECTS.EDIT' }),
  component: () => (
    <WorkspacePlaceholderPage
      titleKey="pages.settingsProjects.title"
      descriptionKey="pages.settingsProjects.description"
    />
  ),
});

export const settingsLeaveTypesRoute = createRoute({
  getParentRoute: () => teamRoute,
  path: '/settings/leave-types',
  beforeLoad: requirePermission({ permission: 'LEAVES.PAGE_ACCESS' }),
  component: () => (
    <WorkspacePlaceholderPage
      titleKey="pages.settingsLeaveTypes.title"
      descriptionKey="pages.settingsLeaveTypes.description"
    />
  ),
});

export const settingsWorkScheduleRoute = createRoute({
  getParentRoute: () => teamRoute,
  path: '/settings/work-schedule',
  beforeLoad: requirePermission({ permission: 'WORK_SCHEDULE.PAGE_ACCESS' }),
  component: () => (
    <WorkspacePlaceholderPage
      titleKey="pages.settingsWorkSchedule.title"
      descriptionKey="pages.settingsWorkSchedule.description"
    />
  ),
});

export const settingsPublicHolidaysRoute = createRoute({
  getParentRoute: () => teamRoute,
  path: '/settings/public-holidays',
  beforeLoad: requirePermission({ permission: 'PUBLIC_HOLIDAYS.EDIT' }),
  component: () => (
    <WorkspacePlaceholderPage
      titleKey="pages.settingsPublicHolidays.title"
      descriptionKey="pages.settingsPublicHolidays.description"
    />
  ),
});

export const settingsDepartmentsRoute = createRoute({
  getParentRoute: () => teamRoute,
  path: '/settings/departments',
  beforeLoad: requirePermission({ permission: 'DEPARTMENTS.PAGE_ACCESS' }),
  component: () => (
    <WorkspacePlaceholderPage
      titleKey="pages.settingsDepartments.title"
      descriptionKey="pages.settingsDepartments.description"
    />
  ),
});

export const settingsNotificationsRoute = createRoute({
  getParentRoute: () => teamRoute,
  path: '/settings/notifications',
  beforeLoad: requirePermission({ permission: 'NOTIFICATION_CONFIG.PAGE_ACCESS' }),
  component: () => (
    <WorkspacePlaceholderPage
      titleKey="pages.settingsNotifications.title"
      descriptionKey="pages.settingsNotifications.description"
    />
  ),
});

export const settingsPermissionsRoute = createRoute({
  getParentRoute: () => teamRoute,
  path: '/settings/permissions',
  beforeLoad: requirePermission({ permission: 'PERMISSIONS.PAGE_ACCESS' }),
  component: () => (
    <WorkspacePlaceholderPage
      titleKey="pages.settingsPermissions.title"
      descriptionKey="pages.settingsPermissions.description"
    />
  ),
});
