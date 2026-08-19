import {
  activateAccountRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
} from './account-link.routes';
import { landingRoute } from './landing.route';
import { loginRoute } from './login.route';
import { notAuthorizedRoute } from './not-authorized.route';
import {
  leaveRequestsRoute,
  projectsRoute,
  publicHolidaysRoute,
  timesheetRoute,
} from './personal.routes';
import { profileRoute } from './profile.route';
import { publicRoute } from './public.route';
import { rootRoute } from './root.route';
import {
  employeesRoute,
  reportsRoute,
  settingsDepartmentsRoute,
  settingsLeaveTypesRoute,
  settingsNotificationsRoute,
  settingsPermissionsRoute,
  settingsProjectsRoute,
  settingsPublicHolidaysRoute,
  settingsWorkScheduleRoute,
  teamIndexRoute,
  teamLeaveRequestsRoute,
  teamRoute,
  teamTimesheetsRoute,
} from './team.routes';
import { workspaceIndexRoute, workspaceRoute } from './workspace.route';

/**
 * The route tree, assembled by hand.
 *
 * **Code-based rather than file-based routing**, deliberately. File-based
 * routing needs the router's Vite plugin and a generated `routeTree.gen.ts`
 * committed alongside the source; this project already generates one large file
 * from the OpenAPI contract, and a second generator earning only a naming
 * convention is not worth the build step. Adding a route here is a file plus a
 * line, and the result is just as typed — `<Link to="/app">` is checked against
 * this tree either way.
 *
 * **The tree has exactly two branches, and they are the two areas.**
 * `publicRoute` is pathless and holds everything reachable without a session —
 * four of its five children exist precisely for somebody who *cannot* sign in,
 * having forgotten a password or never had one. `workspaceRoute` holds
 * everything that needs a session, and carries the single guard.
 *
 * That split is not organisational tidiness: it is where two separate rules
 * live. Whether a screen is guarded, and whether it honours a stored light/dark
 * preference or the operating system's, are both decided by which branch it
 * hangs off — so putting a new screen in the right place gets both right, and
 * there is no third place to put one.
 *
 * ## The authenticated branch now forks again, and that fork is the workspace (F05)
 *
 * `teamRoute` (`/app/team`) holds the administrative screens; the personal ones
 * hang off `/app` directly. That is not presentation either:
 * `workspaceForPath` in `features/workspace/workspace.ts` decides which
 * workspace is open by reading the prefix, so the sidebar's menu, the workspace
 * switcher and the header's section title all follow from where a route is
 * declared here — the same "put it in the right place and the rules apply"
 * property the two top-level branches have.
 */
export const routeTree = rootRoute.addChildren([
  publicRoute.addChildren([
    landingRoute,
    loginRoute,
    forgotPasswordRoute,
    resetPasswordRoute,
    activateAccountRoute,
  ]),
  workspaceRoute.addChildren([
    workspaceIndexRoute,
    notAuthorizedRoute,
    profileRoute,
    timesheetRoute,
    leaveRequestsRoute,
    projectsRoute,
    publicHolidaysRoute,
    teamRoute.addChildren([
      teamIndexRoute,
      teamTimesheetsRoute,
      employeesRoute,
      teamLeaveRequestsRoute,
      reportsRoute,
      settingsProjectsRoute,
      settingsLeaveTypesRoute,
      settingsWorkScheduleRoute,
      settingsPublicHolidaysRoute,
      settingsDepartmentsRoute,
      settingsNotificationsRoute,
      settingsPermissionsRoute,
    ]),
  ]),
]);
