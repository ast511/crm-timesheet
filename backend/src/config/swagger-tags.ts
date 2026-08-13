/**
 * The groups the documentation is read in.
 *
 * A tag is what Swagger UI turns into a collapsible section, so this list is
 * the table of contents of the whole API and the order below is the order a
 * reader meets it in. It is deliberately **not** alphabetical: it follows the
 * dependency order the modules were built in, which is also the order they make
 * sense in. Somebody opening this page for the first time reads "is the service
 * up", then "how do I sign in", then the reference data, then the work that
 * depends on it, and finally the cross-cutting administration.
 *
 * A tag groups a *domain*, not a controller — several controllers share one
 * where they are two halves of the same subject. `/leave-requests` and
 * `/me/leave-requests` are the same resource seen by an approver and by its
 * owner, and splitting them would ask a reader to know which class a route
 * happens to live in.
 *
 * Names are referenced by symbol from `@ApiTags(...)`, never typed as a
 * literal, for the reason `ERROR_CODES` is: a typo would silently create a
 * twenty-second group containing one endpoint. `openapi.e2e-spec.ts` asserts
 * that every tag used in the document is declared here and that every tag
 * declared here is used, so neither half can rot.
 */

/** Every tag name, by symbol. */
export const API_TAG = {
  Service: 'Service',
  Authentication: 'Authentication',
  Profile: 'Profile',
  Users: 'Users & Accounts',
  Employees: 'Employees',
  Departments: 'Departments',
  Positions: 'Positions',
  Projects: 'Projects',
  ProjectMembers: 'Project Members',
  WorkSchedule: 'Work Schedule',
  PublicHolidays: 'Public Holidays',
  LeaveConfiguration: 'Leave Configuration',
  LeaveBalances: 'Leave Balances',
  LeaveRequests: 'Leave Requests',
  Timesheets: 'Timesheets',
  Reporting: 'Reporting',
  Notifications: 'Notifications',
  NotificationManagement: 'Notification Management',
  NotificationDelivery: 'Notification Delivery',
  Permissions: 'Permissions',
  Email: 'Email',
} as const;

/** A tag name, as a type — so a helper cannot be handed an undeclared one. */
export type ApiTagName = (typeof API_TAG)[keyof typeof API_TAG];

/** One tag, in the shape `DocumentBuilder.addTag` takes. */
interface ApiTagDefinition {
  name: ApiTagName;
  description: string;
}

/**
 * The tags in reading order, each with the one sentence that says what the
 * group is *for* — which is the sentence a reader needs and the one a
 * controller name never gives them.
 */
export const API_TAGS: readonly ApiTagDefinition[] = [
  {
    name: API_TAG.Service,
    description:
      'Liveness. Two routes, both public, both read by a container runtime or a load balancer rather than by a person.',
  },
  {
    name: API_TAG.Authentication,
    description:
      'Signing in, refreshing, signing out, and the four ways a password is set. Five of these routes are public because each is protected by a credential other than an access token — a password, a refresh token, or the secret in an emailed link.',
  },
  {
    name: API_TAG.Profile,
    description:
      'The caller’s own account and employment record on one screen, and the only place in the application where somebody edits anything about themselves.',
  },
  {
    name: API_TAG.Users,
    description:
      'Login accounts and their lifecycle — created by an administrator, activated by their owner through an emailed link, enabled and disabled. Restricted to ADMIN and SUPERADMIN; a password is never set or emailed here.',
  },
  {
    name: API_TAG.Employees,
    description:
      'The employment record: who works here, in which department and position, from when until when.',
  },
  {
    name: API_TAG.Departments,
    description: 'The department catalog every employee is filed under.',
  },
  {
    name: API_TAG.Positions,
    description: 'The job-title catalog an employment record points at.',
  },
  {
    name: API_TAG.Projects,
    description: 'The projects hours are eventually logged against.',
  },
  {
    name: API_TAG.ProjectMembers,
    description:
      'Who is assigned to what, and for how long — the same membership seen from the project (its roster) and from the employee (their assignments).',
  },
  {
    name: API_TAG.WorkSchedule,
    description:
      'The one row describing how the company works: which weekdays are worked, how many hours a day, and the company timezone every timestamp in this API should be rendered in.',
  },
  {
    name: API_TAG.PublicHolidays,
    description:
      'The other half of the same question: which working days the company is nevertheless closed on, and the resolved calendar for a given year or month.',
  },
  {
    name: API_TAG.LeaveConfiguration,
    description:
      'Which kinds of leave exist and who is notified about them. Configuration only — nothing here grants or records leave.',
  },
  {
    name: API_TAG.LeaveBalances,
    description:
      'How many days each person actually has, per leave type and per year.',
  },
  {
    name: API_TAG.LeaveRequests,
    description:
      'Asking for leave and deciding on it. `/me/leave-requests` is the requester’s view of the same resource `/leave-requests` gives an approver; approving is the only write in this application that moves another module’s data.',
  },
  {
    name: API_TAG.Timesheets,
    description:
      'The monthly record of what people actually worked — the fill-in rules, the submit/approve/reject lifecycle, and the hour aggregates. The widest reader in the application: the schedule, the holidays, the approved leave, the employment dates and the projects all have to agree about a day before an hour can be logged against it.',
  },
  {
    name: API_TAG.Reporting,
    description:
      'Five predefined reports, each for a single month, previewed as JSON and exported as PDF or Excel. Nothing is stored, so an export can never disagree with the screen it was downloaded from. Gated on `REPORTS.VIEW`.',
  },
  {
    name: API_TAG.Notifications,
    description:
      'The two inboxes — one personal, one administrative — that are stored, read, filtered and cleared. Nothing here decides when a notification is born.',
  },
  {
    name: API_TAG.NotificationManagement,
    description:
      'The intentions behind those notifications: the reminder rules the company wants and the announcements it has composed. Stores both and sends neither.',
  },
  {
    name: API_TAG.NotificationDelivery,
    description:
      'The last link in the chain and the only part that reaches the outside world — in-app, email and WebSocket delivery, on a schedule of its own.',
  },
  {
    name: API_TAG.Permissions,
    description:
      'Who may do what: the permission catalog, what each role grants by default, the presets an administrator applies in one click, and where an individual departs from their role.',
  },
  {
    name: API_TAG.Email,
    description:
      'Whether this deployment can send mail at all. A deployment with no SMTP server is a legitimate state and reports itself here rather than failing at the first notification nobody receives.',
  },
];
