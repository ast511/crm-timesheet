import type { ReactNode } from 'react';

import { useCan } from './usePermissions';
import type { PermissionRequirement } from './permission-set';

export interface CanProps extends PermissionRequirement {
  /** Rendered when the requirement is met. */
  children: ReactNode;
  /**
   * Rendered when it is not. `null` by default — the ordinary case is that a
   * control somebody cannot use is simply not there.
   *
   * Worth using for the cases where an absence is confusing rather than clean:
   * a disabled row of actions that would otherwise collapse to nothing, or an
   * explanation in place of a section that was expected to be there. Not for a
   * "you do not have permission" message beside every button — a screen made of
   * refusals is worse than a shorter screen.
   */
  fallback?: ReactNode;
}

/**
 * Renders its children only for somebody who holds the permission.
 *
 * ```tsx
 * <Can permission="TIMESHEET.APPROVE">
 *   <ApproveButton timesheetId={id} />
 * </Can>
 *
 * <Can anyOf={['REPORTS.VIEW', 'DASHBOARD.VIEW']}>…</Can>
 * ```
 *
 * This is the primitive the layout feature filters the navigation with and that
 * every screen hides its action buttons behind. It exists as a component rather
 * than only as {@link useCan} because the common case is wrapping markup, and
 * `{canApprove && <ApproveButton />}` repeated across thirty screens is thirty
 * chances to write `&&` against a number or to check the wrong key.
 *
 * ## While the set is loading it renders the fallback
 *
 * There is no third branch, deliberately. `usePermissions` reports the empty
 * set until the answer arrives, so a control appears when it is permitted and
 * not before — the alternative, rendering optimistically and retracting, shows
 * somebody a button and takes it away, which is worse than a button that
 * arrives a moment late. A screen for which that moment is visible should
 * suspend or skeleton on `isLoading` at the screen level, where the shape of
 * what is loading is known; `<Can>` around a single button has no shape to
 * stand in for.
 *
 * **It is not a security boundary.** It decides what to draw. The backend
 * refuses the request (Feature 035), and it would refuse it just the same for
 * somebody who edited this out in their browser.
 */
export const Can = ({ children, fallback = null, ...requirement }: CanProps) =>
  useCan(requirement) ? children : fallback;
