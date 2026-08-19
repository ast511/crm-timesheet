# App layout — sidebar, workspaces, header and footer

## Goal

Give the application the shell every authenticated screen renders inside, and
answer the question F04 left implicit: **the permission set decides what
somebody may do — what does the screen actually look like as a result.**

F04 built `<Can>`, `useCan`, `requirePermission` and the mid-session re-sync,
and had nothing to filter. This feature is that consumer. It adds no
authorization logic of its own; a navigation item declares the same
`PermissionRequirement` its route does, and one filter turns the set into a
menu.

## Requirements

- The shadcn sidebar (sidebar-07): an icon rail on desktop, a sheet on mobile.
- One authenticated layout, parameterised — not one per role.
- Navigation driven by F04's permissions, correcting itself when they change.
- Two workspaces, Personal and Team, with a switcher, where "may use Team" is
  derived from permissions rather than from a role.
- The full wordmark when the sidebar is expanded, the square icon when it is
  collapsed.
- A collapsed group opens its children in a popover — keyboard, Escape and
  click-outside included.
- A header with a section title, the existing language and light/dark controls,
  a theme palette dialog driving F02's `ThemeProvider`, and the account.
- A footer.
- Page metadata — `TimeSheet | <page>` — through one mechanism, everywhere.
- Type-check, lint and build clean.

---

## The decision everything else follows from

**The workspace is derived from the URL. It is not stored.**

The mock this was ported from kept the current view in a `useState` inside
`ViewContext`, and that works right up until the state and the address disagree.
There are two ordinary ways to make them:

- **A link.** Somebody opens `/app/team/employees` from an email. The state says
  `personal`, so the sidebar offers the personal menu beside a team screen, and
  the switcher claims to be somewhere it is not.
- **A demotion.** F04's re-sync moves a demoted administrator to
  `/app/not-authorized`. Stored state still says `team`, and would need an
  effect watching the permission set to put it back — a second mechanism doing
  what the redirect had already done.

So `workspaceForPath('/app/team/...') === 'team'`, and switching workspace *is*
a navigation. Both cases stop being cases.

The same reasoning runs through the rest of the feature: **nothing here holds
state that something else already holds.** `WorkspaceProvider` has no `useState`
at all —

```
location.pathname  ─→ workspace
permission set     ─┴→ navigation ─→ canUseTeam
```

— which is why the mid-session demotion required no code to handle. See
*Live re-sync, consumed* below.

---

## Routing

```
workspaceRoute  "/app"          auth guard → await the set → { permissions }
├── workspaceIndexRoute  "/"                    (no requirement — see below)
├── notAuthorizedRoute   "/not-authorized"       no requirement
├── timesheetRoute       "/timesheet"            TIMESHEET.PAGE_ACCESS
├── leaveRequestsRoute   "/leave-requests"       LEAVE_REQUESTS.PAGE_ACCESS
├── projectsRoute        "/projects"             PROJECTS.PAGE_ACCESS
├── publicHolidaysRoute  "/public-holidays"      PUBLIC_HOLIDAYS.PAGE_ACCESS
└── teamRoute            "/team"                 no guard of its own
    ├── teamIndexRoute            "/"            → the first permitted screen
    ├── teamTimesheetsRoute       "/timesheets"          TIMESHEET.APPROVE
    ├── employeesRoute            "/employees"           EMPLOYEES.PAGE_ACCESS
    ├── teamLeaveRequestsRoute    "/leave-requests"      LEAVE_REQUESTS.APPROVE
    ├── reportsRoute              "/reports"             REPORTS.PAGE_ACCESS
    └── settings/…                7 screens              see the table below
```

The `/app/team` prefix is load-bearing rather than cosmetic: it is what
`workspaceForPath` reads. A screen put under `teamRoute` is in the team
workspace by construction, and the menu, the switcher and the header's section
title all follow from where it was declared — the same "put it in the right
place and the rules apply" property `routeTree.ts` already had for public versus
authenticated.

**`teamRoute` declares no guard**, deliberately. One would be a third answer to
"who is an administrator", competing with the per-screen requirements and with
`canUseTeamWorkspace`. Without it, an employee who types `/app/team/employees`
is refused by that screen's own requirement and lands on `/app/not-authorized` —
the same refusal every other route gives, with no special case.

### `/app/team` is a redirect, and per account

Which screen the team workspace should open on depends on who is asking: an HR
lead holds no `REPORTS.PAGE_ACCESS`, and an administrator on `Admin - Limited`
holds none of the seven settings keys. Any *fixed* landing page would refuse
some of the people entitled to the workspace.

So `teamIndexRoute`'s `beforeLoad` calls `firstRouteOf(context.permissions,
'team')` — the same filtered menu the sidebar renders — and redirects there.
When nothing is visible it redirects to `/app` instead: `/app/team` is not a
screen somebody lacks permission for, it is a signpost to screens, and a
signpost pointing at nothing should point home. Verified: a plain employee
typing `/app/team` lands on `/app`, while `/app/team/employees` is refused and
names `EMPLOYEES.PAGE_ACCESS`.

### The one route with no requirement, and why

`workspaceIndexRoute` (`/app`) is the dashboard, and its **menu item** asks for
`DASHBOARD.PAGE_ACCESS` while the **route** asks for nothing.

That asymmetry is deliberate and is the only one in the feature. `/app` is where
`NotAuthorizedPage` offers to send somebody back to, and where `/app/team` lands
anybody with no team workspace. A guard on it would let the way out of the
refusal screen be the thing that refuses them — a loop rather than an
explanation. The permission still does something visible: revoke it and the
dashboard leaves the sidebar. Making the screen unreachable as well belongs to
the feature that builds a real dashboard and can give it somewhere else to send
people.

---

## Navigation

`features/workspace/navigation.ts` is a description, not a mechanism. Every
entry names a route, an icon, an i18n key and the permission it needs;
`getNavigation` is the only thing that reads it.

### Personal

| Item | Route | Requires |
| --- | --- | --- |
| Panou principal | `/app` | `DASHBOARD.PAGE_ACCESS` |
| Pontajul meu | `/app/timesheet` | `TIMESHEET.PAGE_ACCESS` |
| Cererile mele de concediu | `/app/leave-requests` | `LEAVE_REQUESTS.PAGE_ACCESS` |
| Proiecte | `/app/projects` | `PROJECTS.PAGE_ACCESS` |
| Sărbători legale | `/app/public-holidays` | `PUBLIC_HOLIDAYS.PAGE_ACCESS` |

All five are in the backend's `USER` baseline, which is the point: this is the
workspace somebody has when they have nothing else.

### Team

| Item | Route | Requires |
| --- | --- | --- |
| Pontaje | `/app/team/timesheets` | `TIMESHEET.APPROVE` |
| Angajați | `/app/team/employees` | `EMPLOYEES.PAGE_ACCESS` |
| Cereri de concediu | `/app/team/leave-requests` | `LEAVE_REQUESTS.APPROVE` |
| Rapoarte | `/app/team/reports` | `REPORTS.PAGE_ACCESS` |
| **Setări** ▸ Proiecte | `…/settings/projects` | `PROJECTS.EDIT` |
| ▸ Tipuri de concediu | `…/settings/leave-types` | `LEAVES.PAGE_ACCESS` |
| ▸ Program de lucru | `…/settings/work-schedule` | `WORK_SCHEDULE.PAGE_ACCESS` |
| ▸ Sărbători legale | `…/settings/public-holidays` | `PUBLIC_HOLIDAYS.EDIT` |
| ▸ Departamente | `…/settings/departments` | `DEPARTMENTS.PAGE_ACCESS` |
| ▸ Notificări | `…/settings/notifications` | `NOTIFICATION_CONFIG.PAGE_ACCESS` |
| ▸ Permisiuni | `…/settings/permissions` | `PERMISSIONS.PAGE_ACCESS` |

**Two of these are not the obvious key, and that is what makes the workspace
mean anything.**

- *Pontaje* asks for `TIMESHEET.APPROVE`, not `TIMESHEET.PAGE_ACCESS`. Every
  employee holds page access — it is what opens their *own* timesheet. What
  makes a screen a team screen is signing somebody else's off.
- *Sărbători legale* asks for `PUBLIC_HOLIDAYS.EDIT`, not page access, for the
  same reason: an employee sees the holiday calendar in their own workspace;
  maintaining it is the administrative act.

With those two, the `USER` baseline satisfies nothing in the team list, which is
precisely how the workspace becomes unavailable to an employee — see below.

### "May use Team" is derived, and the type enforces it

```ts
export const canUseTeamWorkspace = (permissions: PermissionSet): boolean =>
  getNavigation(permissions, 'team').length > 0;
```

Not a role check, and not a second hand-kept list of "administrative" keys that
would be the same information written twice. If nothing in the team menu is
visible there is no team workspace to switch to — which is exactly the position
a plain employee, and a demoted administrator, are in.

That definition has one failure mode: a single team entry that forgot its
requirement would hand every employee in the company a team workspace containing
one link. So `TEAM_NAVIGATION` is typed as `GatedNavItem[]`, where `requirement`
is **mandatory** on every link and every group child. The failure becomes a
compile error rather than a permissions bug nobody notices until an employee
mentions the new menu.

### One filter, four consumers

`getNavigation(permissions, workspace)` is read by the sidebar, by the workspace
switcher (via `canUseTeamWorkspace`), by the header's section title (via
`findActiveTarget`), and by `/app/team`'s redirect (via `firstRouteOf`). None of
them can disagree about what is visible.

It takes a `PermissionSet` rather than calling a hook, so the route guard —
which cannot call hooks — resolves the same list the sidebar renders. That is
F04's argument for `PermissionSet` being plain functions, reused.

The mock had **five** hand-maintained link lists, one per (role × view) pair,
which is where its `hrTeamLinks` and `adminTeamLinks` quietly drifted apart.
There are two lists here, and the difference between what an HR account and an
administrator see falls out of the filter — measured in the browser: HR gets
four team items and four settings children, an administrator gets five and
seven.

### Which item is "current": longest match wins

```ts
findActiveTarget(items, pathname)
```

A naive "does the path start with the route" marks the dashboard active on every
screen in the personal workspace, because `/app` is a prefix of all of them.
Adding an exact-match exception for `/app` then leaves a nested route matching
nothing useful. Sorting the matches by length and taking the first is correct
for both and stays correct for a route added later — and it is what makes the
header say *Permisiuni* rather than *Setări* on `/app/team/settings/permissions`.

---

## UI / Components

| Component | What it is |
| --- | --- |
| `WorkspaceLayout` | The shell: `SidebarProvider` + `AppSidebar` + `SidebarInset`(header, outlet, footer). |
| `AppSidebar` | Four regions, no props at all. |
| `SidebarBrand` | Wordmark expanded, square icon collapsed, cross-faded. |
| `WorkspaceSwitcher` | The ported `TeamSwitcher`. A menu, or a label. |
| `SidebarNav` | The permitted items, or a skeleton while the set loads. |
| `SidebarNavItem` | Leaf-versus-group fork. |
| `SidebarNavGroup` | A `Collapsible` expanded, a popover collapsed. |
| `SidebarPopoverMenu` | The collapsed submenu. Not in the shadcn block. |
| `SidebarUserMenu` | The ported `NavUser`: address, role, profile seam, sign out. |
| `AppHeader` | Trigger, section title, language, mode, palette, account. |
| `AppFooter` | Copyright, and nothing else. |
| `ThemePaletteDialog` + `ColorSchemePicker` / `RadiusPicker` / `ThemePreview` | The palette dialog. |
| `WorkspacePlaceholderPage` | What the twelve routed screens render until their features exist. |

### One layout, parameterised

Everything that differs between an employee and an administrator is a *value*
read from context — the permission set and the workspace — rather than a
different component tree. `AppSidebar` takes **no props**, which is the
structural difference from the mock: that component took `userRole`, computed a
link list from it, and passed the role down to every consumer.

### The logo, and why it chooses its file differently from `AppLogo`

`AppLogo` (the public area's) uses a `<picture>` with a `prefers-color-scheme`
source, so the browser fetches one file and swaps it natively. That is right
there, because the public screens follow the operating system by construction.

Here they need not agree: this is the account area, where somebody may have
chosen dark on a machine set to light, and the media query would answer a
question nobody asked. So the file is selected from `resolvedColorMode`. The
cost is that both wordmarks can end up fetched across a session, and it is the
correct cost — a light logo on a dark sidebar is a visible bug, a second cached
image is not.

**`logo_short.png` needed no dark variant and did not get one.** It is a blue
rounded tile with a white glyph on transparency, so it carries its own contrast
and reads on both the near-white and the near-black sidebar. Checked in both
modes rather than assumed; nothing was invented to compensate for a problem that
was not there.

### The collapsed popover submenu

When the sidebar is an icon rail there is no room for a group to expand in
place — `SidebarMenuSub` carries `group-data-[collapsible=icon]:hidden` in the
block's own stylesheet — so the children come out sideways.

Behaviour is Base UI's `Popover`: Escape, click-outside, focus into the popup
and back to the trigger, staying on screen near a viewport edge. `openOnHover`
plus the ordinary click means a pointer and a keyboard reach the same menu by
the means each expects.

The enter and exit are framer-motion's, which `CLAUDE.md` requires by name for
this component, and that combination needs one piece of ceremony: **Base UI
removes a closed popup as soon as it stops seeing a CSS animation, and
framer-motion animates inline styles, which is not one.** Its own documentation
prescribes the fix — `<Portal keepMounted>`, `AnimatePresence` owning the exit,
and `actionsRef.unmount()` when the animation finishes. The shadcn wrapper had
made the portal unreachable, so `PopoverContent` gained one optional
`keepMounted` prop; the alternative was for this component to compose the
primitives itself and leave `ui/popover.tsx` unused.

Verified in a browser: seven children on hover, and Escape genuinely removes the
element from the DOM rather than leaving a hidden popup behind.

### A group's `defaultOpen` is frozen at mount

Passing `defaultOpen={holdsActive}` straight through earns a Base UI warning the
moment somebody navigates — *"a component is changing the default open state of
an uncontrolled Collapsible after being initialized"* — and it is right to
complain: a prop that keeps changing is a controlled component wearing an
uncontrolled component's API.

Both honest alternatives are worse. **Controlling it from `holdsActive`** snaps
the group shut the instant the person navigates out of it. **Remounting on a
`key`** resets it on every navigation. Freezing with `useState(holdsActive)`
gives what was actually wanted: a group holding the current screen starts open,
and afterwards it is however the person left it — and the value is re-taken when
the component genuinely remounts, which is what switching workspace does, so a
deep link into `/app/team/settings/permissions` still arrives expanded.

This is also why the group moved into its own file: the hook cannot live after
`SidebarNavItem`'s early return.

### The switcher is a label for somebody with one workspace

A dropdown that opens onto a single entry is a control that does nothing, and a
*disabled* one is worse — it advertises a workspace the person cannot have and
gives them nothing to do about it. For a plain employee the same row renders
with no trigger, no chevron and no menu, which reads as a heading, because that
is what it is.

---

## Live re-sync, consumed (F04 owns it)

The case F04 built for: an administrator is demoted at 14:03 with their tab
open. **Nothing in this feature notices.** The re-sync refetches the effective
set and re-reads `/auth/me`; `usePermissions` re-renders `WorkspaceProvider`;
everything below is derived and recomputes:

| What | Why it corrects |
| --- | --- |
| The menu | `getNavigation` runs against the new set. |
| The workspace switcher | `canUseTeamWorkspace` is `false` — the team list is empty. |
| The workspace itself | The guard moved them to `/app/not-authorized`, which is not under `/app/team`. |
| The role beside their name | `useAuth().user.role`, which the re-sync re-read from `/auth/me`. |
| The explanation | F04's toast. |

Verified end to end in a browser (see *Verification*): an `ADMIN` on
`/app/team/employees`, demoted from another session, is moved off the page with
the personal menu, a label instead of a switcher, "Angajat" instead of
"Administrator", and the access-changed toast.

One thing the run confirmed by accident: the first attempt triggered the 403
with `GET /users`, which answers `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` — and
**nothing happened**, exactly as F04 intended, because that code means the route
is closed to the caller's *role* and no permission would open it. Switching to
`GET /reports`, which answers `AUTHORIZATION_PERMISSION_DENIED`, produced the
whole cascade.

### The one thing the proactive path does not correct

`refetchOnWindowFocus` replaces the permission set, so the menu, the switcher
and the current route all correct themselves on returning to the tab. It does
**not** re-read `/auth/me`, so the role label beside somebody's name lags until
the next `403` or reload. That is F04's design — the re-sync's two calls are
deliberately on the reactive path — and it is recorded here rather than worked
around, because working around it would mean this feature growing its own
opinion about when to re-read the session. Noted in *Future Improvements*.

---

## Theming

### The palette dialog

A `Palette` button in the header opens a dialog with the eight colour schemes,
the five corner radii and a live preview. It drives **F02's existing theme
system and only that**: both pickers call `ThemeProvider.setPreferences`, which
puts the `theme-*` class and `--radius` on `<html>`. Nothing here writes a CSS
variable, keeps a copy of the current palette, or knows what colour violet is.

That is the difference from the mock's `ThemeCustomizer`, which carried its own
provider, its own `localStorage` key and its own list of eight `hsl(...)`
strings — a second theme system beside the first, whose colours were *already*
wrong, because this application's palettes are `oklch`.

**The swatches take their colour from the stylesheet.** Each one wears its own
palette class and paints itself with `bg-primary`; `.theme-violet` on a `<span>`
redefines `--primary` for that subtree exactly as it does on `<html>`. Add a
ninth palette to the backend and the picker shows it correctly with no edit
here. `index.css` states the rule this obeys — *"nothing in JavaScript
references a colour"* — and this is the screen most tempted to break it.

The `dark` class is applied to the swatch alongside the palette in dark mode,
because the stylesheet's dark variants are written as `.dark.theme-violet` —
both classes on one element. Without it, every swatch in a dark dialog would
preview the light palette. Verified: eight swatches, eight distinct computed
colours.

The radius tiles are drawn with `CORNER_RADIUS_REM`, the same map `applyTheme`
writes to `--radius`, so the preview cannot disagree with what picking the
option does.

Changes apply on click rather than behind a Save button, because there is
nothing to save: the whole page is the preview, and a dialog that made you
confirm a colour you can already see would be asking about something you have
already decided.

**Light/dark is deliberately not in this dialog.** It is next door in
`ColorModeToggle`, and the split is the one `theme.ts` argues for at length: the
palette and the radius belong to a person and are stored on the account, while
light versus dark belongs to where they are sitting and is stored on the device.
One dialog would imply the three travel together, and then one of them would not.

### It persists — and applying is how (amended, see below)

Both pickers write to `PATCH /api/v1/profile/me`. See
*Amendment: the theme is stored on the account* at the end of this document for
why the first version of this feature only applied the change, and what had to
move for it to persist.

---

## Page metadata

`CLAUDE.md` has required `TimeSheet | <page name>` and a page-specific
description since F01, through one reusable mechanism. F04's notes recorded that
none existed and that it belonged with the layout feature. It is `usePageMeta`,
and it is now called by **every route component** — the twelve authenticated
screens and the six public ones.

It takes translated strings rather than keys, so the translation stays with the
page's other strings and a language change re-runs the effect for free. There is
**no cleanup**: restoring a previous title on unmount would mean writing the
correct value, then a stale one, then the correct one again during a navigation.
Every route states its own, so there is nothing to restore. `index.html` carries
a static `<title>` and `<meta name="description">` for the moment before React
mounts, and for nothing else.

The header's section title is a *separate* statement — it names where you are in
the menu — and the two agree because they translate the same key.

---

## State & Data

No new queries and no new endpoints. Everything reads what already exists:

| Source | Read by |
| --- | --- |
| `usePermissions()` (F04) | `WorkspaceProvider`, `SidebarNav`'s skeleton |
| `useAuth()` (F03) | `SidebarUserMenu`, `AppHeader` |
| `useTheme()` (F02) | `SidebarBrand`, the palette dialog and its pickers |
| `useRouterState` | `WorkspaceProvider`, `SidebarNav`, `AppHeader` |

The router subscription is narrowed to `location.pathname` through `select`, so
a change of search parameters — `?required=` on the refusal screen — does not
re-render the shell.

`WorkspaceContext` is the only new context and holds no state:
`{ workspace, canUseTeam, navigation, switchWorkspace }`, all derived.

`SidebarProvider` (shadcn's) owns open/collapsed, remembers it in a cookie,
decides sheet-versus-rail from the viewport and binds `Ctrl/⌘ B`.

---

## Responsive behaviour

- **Desktop (`md`+):** sidebar beside the content, collapsing to a 3rem icon
  rail. `SidebarRail` gives a third way to toggle beside the header trigger and
  the keyboard shortcut.
- **Below `md`:** the sidebar is not rendered in the layout at all; the header
  trigger opens it as a sheet.
- **Below `sm`:** the header's account strip is dropped. Three controls plus a
  labelled "sign out" left the section title with about a word, and the way out
  is already in the sidebar sheet — so the narrow layout drops the copy rather
  than shrinking the heading that says where you are.
- The email in the header appears from `lg`.

Checked at 1440, 834 and 390 px: no horizontal scroll at any width, the sheet
opens and closes, the footer sits at the foot of the page rather than pinned to
the viewport.

---

## Adjustments to installed components

| File | Change | Why |
| --- | --- | --- |
| `hooks/use-mobile.ts` | Rewritten on `useSyncExternalStore` | The registry version mirrors a media query into `useState` from a `useEffect`, which fails this project's `react-hooks/set-state-in-effect` rule — and starts at `undefined`, so a phone renders one frame of the desktop layout before correcting. `theme.ts` reads `prefers-color-scheme` the same way, for the same reason. |
| `ui/popover.tsx` | `keepMounted` forwarded to the portal | Required for a framer-motion exit animation; see the popover section. |

Two places where the port could not be a copy, both found by running the code:

- **`DropdownMenuLabel` is Base UI's `Menu.GroupLabel` and throws without a
  `Menu.Group` above it.** Radix — the mock's library — allowed a bare label, so
  both menus crashed into the error boundary the first time they were opened.
  Wrapping in `DropdownMenuGroup` is the fix and the right grouping anyway.
- **Base UI composes through `render`, not `asChild`**, and the outer wrapper
  wins the `data-slot` attribute — a `SidebarMenuButton` rendered by a
  `CollapsibleTrigger` is `data-slot="collapsible-trigger"` with
  `data-sidebar="menu-button"` intact. Worth knowing before writing anything
  that selects on these.

---

## Files Created

| File | What it is |
| --- | --- |
| `src/features/workspace/workspace.ts` | The two workspaces and the path rule. |
| `src/features/workspace/navigation.ts` | The menus, the filter, and the derivations from it. |
| `src/features/workspace/workspace-context.ts` | The context's shape. |
| `src/features/workspace/WorkspaceProvider.tsx` | Derives all of it. Holds nothing. |
| `src/features/workspace/useWorkspace.ts` | The read side. |
| `src/features/workspace/WorkspaceSwitcher.tsx` | The ported `TeamSwitcher`. |
| `src/components/layout/SidebarBrand.tsx` | Wordmark ⇄ icon on collapse. |
| `src/components/layout/SidebarNav.tsx` | The menu, or its skeleton. |
| `src/components/layout/SidebarNavItem.tsx` | Leaf versus group. |
| `src/components/layout/SidebarNavGroup.tsx` | Collapsible, or popover in the rail. |
| `src/components/layout/SidebarPopoverMenu.tsx` | The collapsed submenu. |
| `src/components/layout/SidebarUserMenu.tsx` | The ported `NavUser`. |
| `src/components/layout/AppFooter.tsx` | The footer. |
| `src/components/theme/ThemePaletteDialog.tsx` | The dialog, and the 039 seam. |
| `src/components/theme/ColorSchemePicker.tsx` | Eight swatches that colour themselves. |
| `src/components/theme/RadiusPicker.tsx` | Five tiles that round themselves. |
| `src/components/theme/ThemePreview.tsx` | Real controls, not a facsimile. |
| `src/app/pages/WorkspacePlaceholderPage.tsx` | What the twelve routes render for now. |
| `src/routes/personal.routes.tsx` | Four personal screens. |
| `src/routes/team.routes.tsx` | The team subtree and its entry redirect. |
| `src/hooks/usePageMeta.ts` | Title and description, in one place. |
| `src/i18n/keys.ts` | `CommonKey`, for configuration that stores a key. |
| `src/components/ui/{sidebar,sheet,tooltip,separator,dialog,popover,collapsible,avatar}.tsx` | `npx shadcn add`. |
| `src/hooks/use-mobile.ts` | Same install, rewritten — see above. |
| `FEATURES/F05-app-layout.md` | This document. |

## Files Modified

| File | Change |
| --- | --- |
| `src/app/layout/WorkspaceLayout.tsx` | The stub becomes the shell. |
| `src/components/layout/AppSidebar.tsx` | The placeholder becomes the sidebar. |
| `src/components/layout/AppHeader.tsx` | Section title, palette dialog, sidebar trigger; F03's two seams filled. |
| `src/app/AppProviders.tsx` | `TooltipProvider` — Base UI tooltips need one, and the rail's labels are tooltips. |
| `src/routes/routeTree.ts` | The twelve new routes and the team subtree. |
| `src/app/pages/WorkspaceHomePage.tsx` | Titled from `pages.dashboard`, plus metadata. |
| `src/app/pages/{NotAuthorized,Landing,Login,ForgotPassword,ResetPassword,ActivateAccount}Page.tsx` | `usePageMeta`. |
| `src/components/ui/popover.tsx` | `keepMounted`. |
| `src/locales/{ro,en}/common.json` | `pages`, `workspace`, `sidebar`, `account`, `roles`, `theme`, `footer`; dead `nav` and `shell` keys pruned. |
| `index.html` | A `<meta name="description">` beside the title, as the pre-React fallback. |

## Dependencies

None. `@base-ui/react`, `framer-motion` and `lucide-react` were already
installed; `npx shadcn add` wrote components and added no package.

---

## Verification

`npm run typecheck`, `npm run lint`, `npm run build` — all clean (2 905 modules,
939 kB / 298 kB gzipped).

### In a real browser

Headless Chrome over the DevTools Protocol, the approach F03 and F04 used and
for the same reason. Three harnesses, 45 assertions, all passing, console clean.
They live in the session scratchpad and are not committed — the third feature in
a row to say so.

**The shell, as an administrator (26 checks).** Title and meta description;
the personal menu; the section title; the role in the footer; the wordmark in
the resolved mode; the workspace menu offering both; `/app/team` resolving to
`/app/team/timesheets`; the team menu; the settings group's seven children; a
child navigating and the header naming the deepest match; the rail showing
`logo_short` and hiding the sub-list; the popover opening with all seven
children and Escape genuinely unmounting it; eight palettes with eight distinct
computed swatch colours; Violet putting `theme-violet` on `<html>`; `FULL`
setting `--radius: 1rem` and every real control re-rounding with it.

**Roles and the demotion (16 checks).**

| Check | Result |
| --- | --- |
| A `USER`'s menu | the five personal items, and no switcher |
| A `USER` typing `/app/team` | → `/app` |
| A `USER` typing `/app/team/employees` | → `/app/not-authorized?required=EMPLOYEES.PAGE_ACCESS` |
| `HR` entering the team workspace | → `/app/team/employees`, four items, four settings children |
| An `ADMIN` on `/app/team/employees`, demoted from another session, then a `403` | moved to `/app/not-authorized`; menu back to the five personal items; switcher back to a label; role reads `Angajat`; the access-changed toast |
| The same, triggered with `GET /users` instead | **nothing**, because that answers `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` — F04's exclusion, confirmed by accident |

The demotion is performed through `PATCH /users/:id` from a separate `SUPERADMIN`
session and reversed in a `finally`, so the development database ends the run as
it started.

**Responsive (3 checks + screenshots)** at 1440, 834 and 390 px: below `md` the
sidebar is absent from the layout until the trigger opens it as a sheet, and the
page never scrolls sideways.

### Notes on the harness

The 403 has to travel through the application's **own** axios instance, because
that is where F04 hung its interceptor. Vite serves source modules in
development, so `await import('/src/api/http.ts')` from the page returns the
module registry's existing instance — the real client, not a copy. Worth
knowing: it makes any module's exports reachable from a test without the
application exporting anything for testing's sake.

Base UI opens menus and popovers on `pointerdown`, which `element.click()` does
not produce. Every trigger has to be driven with a real
`Input.dispatchMouseEvent`. This cost an hour of "the menu does not open" before
it was the DOM being inspected rather than the code being read.

Running two harnesses back to back exhausts the login rate limit and the next
sign-in answers `401` — F04's lesson about page loads, in a new costume.

---

## Notes

### The header and the sidebar both offer sign out

Both were specified and both are built: the header strip is the address and the
way out at a glance, `SidebarUserMenu` is the fuller identity with the role and
the profile entry. They overlap in one control. It is recorded here as something
to settle rather than something that settled itself — see *Future Improvements*.

### There is no version number in the footer

`package.json` says `0.0.0` and nothing sets it. Printing that would be a fact
the application states about itself that happens to be untrue; a real one needs
a build-time value injected through `vite.config.ts`, which is a change to the
build rather than to a component.

### The reference mock is not in this repository

It was read from `00_bkps/00_old/28.10.2025/src/` — `components/sidebar/`
(AppSidebar, NavMain, NavUser, PopoverMenu), `components/TeamSwitcher.tsx`,
`contexts/ViewContext.tsx`, `lib/helpers/sidebar.helper.ts`,
`constants/sidebar.ts` and `components/shared/theme/ThemeCustomizer.tsx`. The
`preferences.PNG` the brief refers to is not anywhere on the tree; the
`ThemeCustomizer` is the same design in code and was used as the reference
instead.

---

## Future Improvements

1. **Decide where sign out lives.** Two of them on one screen is one too many.
   The likely answer is the sidebar's account menu, with the header keeping only
   the address — but that is a product decision, not a refactor.
2. **Re-read the role on the proactive path too**, or have the components that
   name a role read `PermissionSet.role` instead of `useAuth().user.role`. F04
   carries the role on the set precisely so both answers come from one response;
   today the label lags a focus-refetch. One line either way, and it belongs
   with whoever owns F04's re-sync.
3. **Keep the browser checks.** Forty-five assertions found two real defects
   here — the `Menu.Group` crash and the `defaultOpen` warning — and both were
   invisible to `tsc`, to ESLint and to reading. This is the third feature to
   ask for a Playwright suite.
4. **A real version in the footer**, through a `define` in `vite.config.ts` fed
   from the package version or the build's git SHA.
5. **Revisit F04's 60 s `staleTime` now that the sidebar exists.** F04 deferred
   the question on the grounds that nothing visibly corrected itself yet.
   Something does now, so the number is answerable: it is the ceiling on how
   long a menu can be wrong in a tab nobody is touching.
6. **Breadcrumbs rather than a single section title.** `findActiveTarget`
   already resolves the deepest match; the group above it is one field away, and
   `/app/team/settings/permissions` would read better as `Setări › Permisiuni`.
   Left out because a two-level menu makes it nearly a wrapper around one string.

---

# Amendment: the theme is stored on the account

Three changes, asked for after the first version: the header should name the
person rather than address them, a chosen theme should survive a reload, and `/`
should be a signpost instead of a screen. The first two turned out to be the
same change.

## `GET /profile/me` answers both

`AuthUserEntity` carries `id`, `email`, `role`, `employeeId` and
`administrativeAccess` — **no username**. The username lives on `ProfileAccount`,
beside `colorScheme` and `cornerRadius`, and the backend explains why: the query
behind `/auth/me` runs on every authenticated request and is not the place to
add columns nothing authenticates with. So the name in the header and the palette
on `<html>` come from one call, added to `workspaceRoute`'s `beforeLoad` beside
the permission set.

`username` is `string | null` in the contract, so `useDisplayName` falls back to
the address. An empty header would be worse than an address, and inventing a
non-null username would be re-declaring the contract.

## Why persisting required removing a setter rather than adding a call

The first version had `ThemeProvider` hold the preferences in `useState` behind
`setPreferences`, with a seam saying the profile feature would call it. Adding
the `PATCH` beside that setter would have "worked" and been wrong in a way that
only shows on the third or fourth use: **two copies of one value, one in React
and one on the server, and nothing deciding which is right.**

The reported symptom is exactly what that produces. `setPreferences` repaints the
screen; the reload asks the server; the server was never told, or was told and is
no longer consulted. Whichever half you add first, the bug is the *pair*.

So the server's copy became the only copy:

```
GET /profile/me ─→ profile query ─→ useStoredThemePreferences()
                         ▲                      │
                         │                      ▼
   PATCH /profile/me ────┘            ThemeProvider preferences=…
   (optimistic setQueryData)                    │
                                                ▼
                                          applyTheme(<html>)
```

`ThemeProvider` receives the preferences as a **prop** and no longer holds or
sets them. `setPreferences` is gone from the context, and its absence is the
design: there is no "apply without saving" left to express.

Three things fall out of that, and they are the reason it was worth doing rather
than patching:

- **Applying and persisting are one action.** The optimistic `setQueryData` in
  `useUpdateThemePreferences` is what repaints the screen, because the theme is
  rendered from that cache entry. There is no second path that could disagree.
- **A refused `PATCH` rolls the palette back** and translates the `errorCode`
  into a toast. Fire-and-forget would leave somebody looking at a theme their
  account does not have, and they would find out on the next device.
- **No effect, and no `set-state-in-effect` escape hatch.** Syncing a query into
  provider state would have needed one; deriving needs nothing.

F02's `ThemeProvider` documentation said it "does not read the profile, does not
write it back, and knows nothing about authentication". All three are still true
— it takes a value and applies it. What changed is who supplies the value.

`ThemedApp` in `AppProviders` is where the query is read, below
`QueryClientProvider` and above everything else. It is also the query's one
permanent observer, the same arrangement `AppRouter` has for the permission set:
without it, a profile populated by a route loader would be a cache entry nothing
is watching.

**Anonymous sessions get the backend's own column defaults** (`DEFAULT`,
`MEDIUM`), because the query is disabled without a session. So the boot spinner
and every public screen are painted in the default theme, and signing out drops
back to it — verified, rather than assumed: a `SUPERADMIN`'s violet does not
follow them onto the login form.

## `/` is a redirect

`landingRoute` no longer has a component. `beforeLoad` throws to `/app` or
`/login` depending on the session, which is known by then because `AuthGate`
holds the router back until `GET /auth/me` has answered.

No `?redirect=` is recorded. That parameter exists so `/app`'s guard can return
somebody to the screen they asked for; `/` is not a screen anybody asked for, and
carrying it forward would send them back into this redirect after signing in.

`LandingPage.tsx` is deleted, along with the `landing`, `pages.landing` and
`actions.openWorkspace` strings in both bundles.

## Files

| File | What |
| --- | --- |
| `src/features/profile/profile-api.ts` | New. `GET` and `PATCH /profile/me`. |
| `src/features/profile/profile-query.ts` | New. The query, user-scoped, and the loader. |
| `src/features/profile/useProfile.ts` | New. `useProfile`, `useDisplayName`, `useStoredThemePreferences`, `useUpdateThemePreferences`. |
| `src/theme/ThemeProvider.tsx` | Controlled: `preferences` prop, no internal state. |
| `src/theme/theme-context.ts` | `setPreferences` removed. |
| `src/app/AppProviders.tsx` | `ThemedApp` reads the stored preferences. |
| `src/components/theme/ThemePaletteDialog.tsx` | Writes through the mutation. |
| `src/components/layout/AppHeader.tsx` | `useDisplayName()` instead of `user.email`. |
| `src/routes/workspace.route.tsx` | Awaits the profile beside the permissions. |
| `src/routes/landing.route.tsx` | A redirect, with no component. |
| `src/app/pages/LandingPage.tsx` | Deleted. |
| `src/locales/{ro,en}/common.json` | `landing`, `pages.landing`, `actions.openWorkspace` pruned. |

The sidebar's account menu still shows the **address** and the role, deliberately:
it is the identity card, the header is the compact name, and between them the
email is still visible somewhere.

## Verification

`typecheck`, `lint` and `build` clean. A third browser harness, 11 assertions:

| Check | Result |
| --- | --- |
| `/` signed out | → `/login`, and "Fundația aplicației" appears nowhere |
| `/` signed in | → `/app` |
| The header | shows `MIO`, and no `@` anywhere in the strip |
| Picking Green, then radius `0` | applies immediately |
| `GET /profile/me` straight after | `GREEN` / `NONE` — the half that was missing |
| **A full page reload** | still Green, still `0rem` |
| Re-opening the picker | opens on the stored values, not the defaults |
| Signing out | back to the default palette on `/login` |

The 26-assertion shell harness and the 16-assertion roles harness were re-run
against the change and still pass, console clean. The harness restores the
account's original preferences in a `finally`, so the development database ends
as it started.
