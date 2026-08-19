import type { LinkProps } from '@tanstack/react-router';
import {
  BarChart3Icon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  FolderKanbanIcon,
  LayoutDashboardIcon,
  PalmtreeIcon,
  SettingsIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';

import type { PermissionRequirement, PermissionSet } from '@/features/permissions/permission-set';
import type { CommonKey } from '@/i18n/keys';

import type { Workspace } from './workspace';

/**
 * What the sidebar offers, declared once, per workspace.
 *
 * This file is a **description**, not a mechanism: every item names a route,
 * an icon, an i18n key and the permission it needs, and `getNavigation` below
 * is the only thing that reads it. Adding a screen to the menu is one entry
 * here and a route; nothing else in the layout changes.
 *
 * ## Gating is by permission, never by role
 *
 * F04 owns the question of what somebody may do and answers it identically for
 * a route guard and for a menu item — same `PermissionRequirement`, same
 * `satisfies`. So a requirement written here is the same sentence the route
 * writes in its `beforeLoad`, and the menu cannot offer a door the guard will
 * shut. A `role === 'ADMIN'` anywhere in this file would be a second
 * authorization rule with nothing keeping it in step with the first.
 *
 * The mock this was ported from had five hand-maintained link lists, one per
 * (role × view) pair, which is where its `hrTeamLinks` and `adminTeamLinks`
 * quietly drifted apart. There are two lists here and the difference between
 * what an HR account and an administrator see falls out of the filter.
 */

/** A path in this application's route tree, checked against the router. */
export type NavRoute = NonNullable<LinkProps['to']>;

interface NavEntryBase {
  /** Key into the `common` bundle. The same key the screen titles itself with. */
  titleKey: CommonKey;
  /**
   * What the person must hold to be shown this.
   *
   * Omitted means "always visible" — F04's stated rule for a requirement with
   * no fields, and the reason the personal workspace's list is allowed to omit
   * it while the team's is not (see {@link TEAM_NAVIGATION}).
   */
  requirement?: PermissionRequirement;
}

/** A child of a collapsible group. Groups are one level deep, deliberately. */
export interface NavChild extends NavEntryBase {
  route: NavRoute;
}

/**
 * One row of the menu: either a link, or a group that opens into children.
 *
 * A union rather than one shape with two optional fields, so `children ===
 * undefined` narrows to the arm that has a `route` and the renderer never has
 * to decide what a group with a route of its own would mean.
 */
export type NavItem = NavEntryBase & { icon: LucideIcon } & (
    | { route: NavRoute; children?: undefined }
    | { route?: undefined; children: readonly NavChild[] }
  );

/**
 * The team workspace's items, with the permission **required by the type**.
 *
 * That is not decoration. "Can this person use the team workspace at all" is
 * answered by {@link canUseTeamWorkspace} as "does anything in this list survive
 * the filter", so a single entry that forgot its requirement would hand every
 * employee in the company a team workspace containing one link. Making the
 * field mandatory turns that into a compile error instead of a permissions bug
 * nobody notices until an employee mentions the new menu.
 *
 * A *group* still declares none — it is shown when at least one of its children
 * is, which is the same rule stated one level down.
 */
type GatedNavChild = NavChild & { requirement: PermissionRequirement };

type GatedNavItem = NavEntryBase & { icon: LucideIcon } & (
    | { route: NavRoute; children?: undefined; requirement: PermissionRequirement }
    | { route?: undefined; children: readonly GatedNavChild[] }
  );

/**
 * The signed-in person's own work.
 *
 * Every entry is in the `USER` role's baseline (backend `permission-sets.ts`),
 * so an ordinary employee sees all five — which is the point: this is the
 * workspace somebody has when they have nothing else.
 *
 * The dashboard names `DASHBOARD.PAGE_ACCESS` even though everybody holds it,
 * because the menu item and the screen should say the same thing about
 * themselves, and an account can have it revoked individually.
 */
export const PERSONAL_NAVIGATION: readonly NavItem[] = [
  {
    titleKey: 'pages.dashboard.title',
    route: '/app',
    icon: LayoutDashboardIcon,
    requirement: { permission: 'DASHBOARD.PAGE_ACCESS' },
  },
  {
    titleKey: 'pages.timesheet.title',
    route: '/app/timesheet',
    icon: ClipboardListIcon,
    requirement: { permission: 'TIMESHEET.PAGE_ACCESS' },
  },
  {
    titleKey: 'pages.leaveRequests.title',
    route: '/app/leave-requests',
    icon: CalendarDaysIcon,
    requirement: { permission: 'LEAVE_REQUESTS.PAGE_ACCESS' },
  },
  {
    titleKey: 'pages.projects.title',
    route: '/app/projects',
    icon: FolderKanbanIcon,
    requirement: { permission: 'PROJECTS.PAGE_ACCESS' },
  },
  {
    titleKey: 'pages.publicHolidays.title',
    route: '/app/public-holidays',
    icon: PalmtreeIcon,
    requirement: { permission: 'PUBLIC_HOLIDAYS.PAGE_ACCESS' },
  },
];

/**
 * Everybody else's work — the administrative half.
 *
 * The requirements are chosen so that the *distinction* the backend already
 * draws is the one the menu draws. Two are worth spelling out because the
 * obvious key would have been wrong:
 *
 * - **Timesheets asks for `TIMESHEET.APPROVE`, not `TIMESHEET.PAGE_ACCESS`.**
 *   Every employee holds page access — it is what opens their *own* timesheet.
 *   What makes a screen a team screen is signing somebody else's off.
 * - **Public holidays asks for `PUBLIC_HOLIDAYS.EDIT`, not page access**, for
 *   the same reason: an employee sees the holiday calendar in their own
 *   workspace; maintaining it is the administrative act.
 *
 * With these, the `USER` baseline satisfies nothing here and the workspace is
 * correctly unavailable; `HR` satisfies six of them and `ADMIN` the rest.
 */
export const TEAM_NAVIGATION: readonly GatedNavItem[] = [
  {
    titleKey: 'pages.teamTimesheets.title',
    route: '/app/team/timesheets',
    icon: ClipboardCheckIcon,
    requirement: { permission: 'TIMESHEET.APPROVE' },
  },
  {
    titleKey: 'pages.employees.title',
    route: '/app/team/employees',
    icon: UsersIcon,
    requirement: { permission: 'EMPLOYEES.PAGE_ACCESS' },
  },
  {
    titleKey: 'pages.teamLeaveRequests.title',
    route: '/app/team/leave-requests',
    icon: CalendarCheckIcon,
    requirement: { permission: 'LEAVE_REQUESTS.APPROVE' },
  },
  {
    titleKey: 'pages.reports.title',
    route: '/app/team/reports',
    icon: BarChart3Icon,
    requirement: { permission: 'REPORTS.PAGE_ACCESS' },
  },
  {
    titleKey: 'pages.settings.title',
    icon: SettingsIcon,
    children: [
      {
        titleKey: 'pages.settingsProjects.title',
        route: '/app/team/settings/projects',
        requirement: { permission: 'PROJECTS.EDIT' },
      },
      {
        titleKey: 'pages.settingsLeaveTypes.title',
        route: '/app/team/settings/leave-types',
        requirement: { permission: 'LEAVES.PAGE_ACCESS' },
      },
      {
        titleKey: 'pages.settingsWorkSchedule.title',
        route: '/app/team/settings/work-schedule',
        requirement: { permission: 'WORK_SCHEDULE.PAGE_ACCESS' },
      },
      {
        titleKey: 'pages.settingsPublicHolidays.title',
        route: '/app/team/settings/public-holidays',
        requirement: { permission: 'PUBLIC_HOLIDAYS.EDIT' },
      },
      {
        titleKey: 'pages.settingsDepartments.title',
        route: '/app/team/settings/departments',
        requirement: { permission: 'DEPARTMENTS.PAGE_ACCESS' },
      },
      {
        titleKey: 'pages.settingsNotifications.title',
        route: '/app/team/settings/notifications',
        requirement: { permission: 'NOTIFICATION_CONFIG.PAGE_ACCESS' },
      },
      {
        titleKey: 'pages.settingsPermissions.title',
        route: '/app/team/settings/permissions',
        requirement: { permission: 'PERMISSIONS.PAGE_ACCESS' },
      },
    ],
  },
];

const NAVIGATION: Record<Workspace, readonly NavItem[]> = {
  personal: PERSONAL_NAVIGATION,
  team: TEAM_NAVIGATION,
};

/**
 * The menu somebody actually gets: one workspace's items, minus everything
 * they may not open.
 *
 * **The single entry point.** The sidebar renders what this returns, the
 * workspace switcher asks whether the team list is empty, the header finds the
 * current section in it, and `/app/team` picks its redirect target from it —
 * four consumers, one filter, so none of them can disagree about what is
 * visible.
 *
 * A group survives when at least one of its children does. That is what makes
 * "Settings" disappear for an HR account that holds none of the seven
 * configuration permissions, rather than expanding into nothing.
 *
 * It takes a `PermissionSet` rather than calling a hook, so a route's
 * `beforeLoad` — which cannot call hooks — resolves the same list the sidebar
 * renders. Same argument F04 makes for `PermissionSet` being plain functions.
 */
export const getNavigation = (
  permissions: PermissionSet,
  workspace: Workspace,
): readonly NavItem[] =>
  NAVIGATION[workspace].reduce<NavItem[]>((visible, item) => {
    if (!permissions.satisfies(item.requirement ?? {})) return visible;

    if (item.children === undefined) return [...visible, item];

    const children = item.children.filter((child) =>
      permissions.satisfies(child.requirement ?? {}),
    );

    return children.length === 0 ? visible : [...visible, { ...item, children }];
  }, []);

/**
 * Whether the team workspace is offered at all.
 *
 * Derived from the filtered list rather than from a role, and rather than from
 * a second hand-kept list of "administrative" keys that would be the same
 * information written twice. If nothing in the team menu is visible there is no
 * team workspace to switch to — which is exactly the position a plain employee,
 * and a demoted administrator, are in.
 */
export const canUseTeamWorkspace = (permissions: PermissionSet): boolean =>
  getNavigation(permissions, 'team').length > 0;

/**
 * The first screen of a workspace that this person may open.
 *
 * `/app/team` is a stable address to link and to switch to, but which screen it
 * should land on depends on the account: an HR lead has no reports and an
 * administrator brought in on `Admin - Limited` has no settings. Rather than
 * pick a fixed target and let it refuse half the people who hold the workspace,
 * the entry route resolves to the top of the menu they were just shown.
 *
 * `undefined` when the workspace is empty, which the caller turns into a
 * redirect somewhere that is not.
 */
export const firstRouteOf = (
  permissions: PermissionSet,
  workspace: Workspace,
): NavRoute | undefined => {
  const [first] = getNavigation(permissions, workspace);

  if (first === undefined) return undefined;

  return first.children === undefined ? first.route : first.children[0]?.route;
};

/** A menu entry that actually leads somewhere: a link, or a group's child. */
export interface NavTarget {
  route: NavRoute;
  titleKey: CommonKey;
}

const targetsOf = (items: readonly NavItem[]): NavTarget[] =>
  items.flatMap((item) =>
    item.children === undefined
      ? [{ route: item.route, titleKey: item.titleKey }]
      : item.children.map(({ route, titleKey }) => ({ route, titleKey })),
  );

/**
 * Screens reached from the **account menu** rather than from the sidebar (F06).
 *
 * They are targets without being menu items, and the distinction is not a
 * technicality. The two lists above are *the workspace's* screens, filtered by
 * permission — putting the profile in one of them would give it a permission it
 * does not have, a workspace it does not belong to, and a row in a menu that is
 * about work rather than about the person doing it.
 *
 * But `/app/profile` is still somewhere you can be, and the header still has to
 * say where that is. Listing it here is the smaller of the two claims: it names
 * screens, not permissions, and {@link findActiveTarget} — which is what the
 * header and the sidebar's highlight both read — searches it after the menu.
 *
 * Every entry must be reachable without a permission, since nothing filters this
 * list. That holds for the profile by construction: `profileRoute` declares no
 * requirement because a person cannot be refused their own record.
 */
const ACCOUNT_TARGETS: readonly NavTarget[] = [
  { route: '/app/profile', titleKey: 'pages.profile.title' },
];

/**
 * Which menu entry the current URL is on.
 *
 * **Longest match wins**, and that single rule replaces two special cases. A
 * naive "does the path start with the route" marks the dashboard active on
 * every screen in the personal workspace, because `/app` is a prefix of all of
 * them; adding an exact-match exception for `/app` then leaves
 * `/app/team/settings/projects` matching nothing useful if the settings group
 * is ever given a route of its own. Sorting the matches by length and taking
 * the first is correct for both, and stays correct for a nested route added
 * later.
 *
 * One function, three consumers — the highlighted item, the expanded group, and
 * the header's section title — so the sidebar cannot highlight one screen while
 * the header names another.
 *
 * {@link ACCOUNT_TARGETS} is searched alongside the menu, which is what lets the
 * header name the profile page. Longest match still decides, so `/app/profile`
 * beats the dashboard's `/app` and the sidebar correctly highlights **nothing**
 * while somebody is on a screen that is not in its menu — better than leaving
 * the dashboard lit on a page that is not the dashboard.
 */
export const findActiveTarget = (
  items: readonly NavItem[],
  pathname: string,
): NavTarget | undefined =>
  [...targetsOf(items), ...ACCOUNT_TARGETS]
    .filter(({ route }) => pathname === route || pathname.startsWith(`${String(route)}/`))
    .sort((a, b) => String(b.route).length - String(a.route).length)[0];
