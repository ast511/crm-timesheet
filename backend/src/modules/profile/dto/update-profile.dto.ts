import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { ValidateIfPresent } from '../../../common/decorators/validate-if-present.decorator';
import { UiColorScheme, UiCornerRadius } from '../../../generated/prisma/enums';
import { IsEmployeePhone } from '../../employees/dto/employee-field.decorators';

/**
 * Body of `PATCH /api/v1/profile/me` — **the complete list of what a person may
 * change about themselves.**
 *
 * Three fields. That is not a placeholder, and the shortness is the design: the
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
 * | `colorScheme` | what the application looks like to them and to nobody else. |
 * | `cornerRadius` | the same. |
 *
 * ## Two tables, one body
 *
 * `phone` is a column of `employees` and the two preferences are columns of
 * `users`, which is invisible from the wire and deliberately so: a person
 * editing their own settings is not thinking about which of the two halves of
 * themselves a field belongs to. It has one consequence a caller can observe —
 * an account with **no employment record** may set its preferences and may not
 * set a phone, because there is no row to set it on. See `ProfileService`,
 * which refuses only the half that has nowhere to go and writes both halves in
 * one transaction so a rejected request changes nothing at all.
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
 * ## The account preferences, and the ones still absent
 *
 * This class used to say there was no `theme` here because there was no such
 * column, and that when a preference was genuinely needed it would belong on
 * `users` — a property of the account rather than of the employment record —
 * and would join this whitelist on the same day. Feature 039 is that day, and
 * both halves held: `users.color_scheme` and `users.corner_radius` are the
 * columns, and they are declared below.
 *
 * The list stops there on purpose. There is still no `language`, no
 * `dateFormat`, no `density` and no notification preference, for the reason the
 * original sentence gave — a column arrives with the thing that reads it, and
 * nothing reads those.
 *
 * **There is no light/dark field either, and there is not going to be a column
 * for one.** That preference belongs to the machine rather than to the person:
 * the same colleague wants dark at night and light at noon on the same laptop,
 * the browser already knows which through `prefers-color-scheme`, and a stored
 * value would mean a server round trip to contradict the operating system. The
 * frontend keeps it locally with a local toggle. See [UiColorScheme] in
 * `schema.prisma`.
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

  /**
   * Which of the application's eight palettes to render for this person.
   *
   * `@IsEnum` against the column's own enum, so an unknown palette is a `400`
   * carrying `VALIDATION_ERROR` and naming the property — the same answer as any
   * other bad field, from the same global pipe. The alternative, accepting the
   * string and letting PostgreSQL refuse it, would turn a typo into a `500`.
   *
   * **Not nullable, unlike `phone`.** The column has no null: `DEFAULT` is the
   * standard theme, stated positively, so "put me back to normal" is a value to
   * send rather than a clearing. That is why this is `@ValidateIfPresent()` and
   * not `@IsOptional()` — the latter waves an explicit `null` straight past
   * `@IsEnum` and into a `NOT NULL` column, turning a client's mistake into a
   * `500`. The same trap `UpdateEmployeeLeaveBalanceDto` documents.
   */
  @ValidateIfPresent()
  @ApiPropertyOptional({
    enum: UiColorScheme,
    example: UiColorScheme.VIOLET,
    description:
      'One of the application’s eight fixed palettes. `DEFAULT` is the standard theme rather than the absence of a choice, so there is no null. Light and dark are **not** here — the frontend keeps that locally, following the system setting.',
  })
  @IsEnum(UiColorScheme)
  readonly colorScheme?: UiColorScheme;

  /**
   * How rounded this person wants the corners.
   *
   * A symbol rather than a number, and the frontend turns it into CSS:
   * `NONE` = `0rem`, `SMALL` = `0.3rem`, `MEDIUM` = `0.5rem` (the default),
   * `LARGE` = `0.75rem`, `FULL` = `1rem`. The mapping is documented on
   * [UiCornerRadius] in `schema.prisma`, and the API neither sends nor accepts
   * the number — a `decimal` column would have accepted `0.42`, which is not one
   * of the five options anybody can pick.
   *
   * `@ValidateIfPresent()` rather than `@IsOptional()`, for the reason
   * {@link UpdateProfileDto.colorScheme} gives: this column has no null either.
   */
  @ValidateIfPresent()
  @ApiPropertyOptional({
    enum: UiCornerRadius,
    example: UiCornerRadius.LARGE,
    description:
      'How rounded the corners are, as one of five symbols. The frontend maps them to CSS: `NONE` = `0rem`, `SMALL` = `0.3rem`, `MEDIUM` = `0.5rem` (the default), `LARGE` = `0.75rem`, `FULL` = `1rem`. The number is never sent — the enum is what keeps the value one of the five that exist.',
  })
  @IsEnum(UiCornerRadius)
  readonly cornerRadius?: UiCornerRadius;
}
