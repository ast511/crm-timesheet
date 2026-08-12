import { IsOptional } from 'class-validator';

import { IsEmployeePhone } from '../../employees/dto/employee-field.decorators';

/**
 * Body of `PATCH /api/v1/profile/me` — **the complete list of what a person may
 * change about themselves.**
 *
 * One field. That is not a placeholder, and the shortness is the design: the
 * question this endpoint answers is "which facts about somebody are *theirs*
 * rather than the company's", and in this application the answer is almost
 * nothing. Everything else on a profile screen is either an identity fact, an
 * organisational fact, or a credential, and each of those is changed somewhere
 * else by somebody who is entitled to.
 *
 * ## What is editable, and why only this
 *
 * | Field | Why it is here |
 * | --- | --- |
 * | `phone` | a personal contact detail. Nothing in the application computes on it, no other record points at it, and the person is the one who knows when it changes. |
 *
 * ## What is deliberately not editable, and where it lives instead
 *
 * | Field | Why not | Changed by |
 * | --- | --- | --- |
 * | `email` | the account's identity, and now also where every activation and reset link goes. Changing it unverified would redirect the account's own recovery. | nobody yet — email verification is a documented follow-up |
 * | `password` | the current one has to be proven first, which a patch cannot do | `POST /auth/change-password` |
 * | `role` | self-service role editing is self-service privilege escalation | `PATCH /users/:id`, ADMIN/SUPERADMIN only |
 * | `status` | whether an account may sign in is not its owner's decision | `POST /users/:id/activate` / `deactivate` |
 * | `employeeCode` | HR's identifier for the person; reports and exports key on it | `PATCH /employees/:id` |
 * | `position`, `department`, `seniority` | organisational facts. Somebody promoting themselves is the obvious abuse, but the quieter one is that a department decides whose leave routes to which approver. | `PATCH /employees/:id`, HR |
 * | `hireDate`, `terminationDate` | employment dates bound which days a timesheet may claim hours for | `PATCH /employees/:id`, HR |
 * | `canReplaceOthers` | says this person may cover somebody's leave; it is a statement about them made by HR | `PATCH /employees/:id`, HR |
 *
 * ## Why the whitelist is the *class*, not a filter in the service
 *
 * The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`,
 * so a property this class does not declare is a `400` naming it rather than a
 * value silently dropped. A `role` or `positionId` smuggled into the payload
 * therefore fails loudly, and — this is the part that matters — a field *added*
 * to this class in future is the only way to widen what a user may change about
 * themselves. There is no `Object.assign(employee, dto)` anywhere below it that
 * could quietly start honouring more than was intended.
 *
 * Rejecting rather than ignoring is also the kinder behaviour: a client that
 * thought it was updating somebody's position is told it was not, instead of
 * showing a success message over a change that never happened.
 *
 * ## No account preferences
 *
 * There is no `language` and no `theme` here, because there are no such columns.
 * Inventing them for a profile screen would be adding schema for a feature
 * nobody has asked for, and this project's rule is that a column arrives with the
 * thing that reads it. When a preference is genuinely needed it belongs on
 * `users` — it is a property of the account rather than of the employment record
 * — and it belongs in this whitelist on the same day.
 */
export class UpdateProfileDto {
  /**
   * The person's contact telephone number.
   *
   * Optional like every field in a patch: absent means "leave it alone". An
   * explicit `null` (or `""`, which the decorator folds to `null`) clears it,
   * which is a different request from omitting it and has to stay possible —
   * somebody who no longer wants a number on file must be able to remove it.
   *
   * Reuses `@IsEmployeePhone()` rather than restating a rule, so a number
   * accepted here is exactly a number HR could have typed on the employee screen.
   */
  @IsOptional()
  @IsEmployeePhone()
  readonly phone?: string | null;
}
