import { IsBoolean, IsOptional } from 'class-validator';

import { IsIsoDateString } from '../../../common/decorators/is-iso-date-string.decorator';
import { ValidateIfPresent } from '../../../common/decorators/validate-if-present.decorator';
import { HolidayType } from '../../../generated/prisma/enums';
import {
  IsHolidayType,
  IsPublicHolidayDescription,
  IsPublicHolidayName,
  IsPublicHolidayYear,
} from './public-holiday-field.decorators';

/**
 * Body of `PATCH /api/v1/public-holidays/:id`.
 *
 * Every field is optional, and an absent one means "leave it alone" — Prisma
 * omits `undefined` from the `UPDATE`, so a partial body never blanks a column
 * the client did not mention. `description`, `validFromYear` and `validToYear`
 * are the nullable columns, so they are the fields where an explicit `null` is
 * a request ("clear it", "re-open that end of the range") rather than a
 * mistake; everywhere else `@ValidateIfPresent()` turns `null` into a `400`
 * instead of letting `@IsOptional()` wave it through to a column that cannot
 * hold it.
 *
 * **A repeal is a patch, and it does not rewrite the past.** When a government
 * drops a holiday, the administrator sends `{ "validToYear": 2026 }` and the
 * row keeps answering for 2026 and every year before it. Reinstating the
 * holiday later — with the same date or a different one — is a `POST` of a new
 * version, not a patch of this one, because editing the dates here would change
 * what 2026 looked like.
 *
 * Nothing in this class or in the service treats a `FIXED` holiday as
 * read-only, and there is no field that could not be patched. Correcting a
 * version that was entered wrongly is exactly what that is for; the rule above
 * is about recording a *change in the world*, which is a new version.
 *
 * Changing `type` is allowed and is not a special case: the service re-derives
 * `isRecurring` from the new type and re-applies the duplicate rule that goes
 * with it, so a holiday reclassified from `VARIABLE` to `FIXED` is checked
 * against the fixed calendar rather than against the rule it used to obey.
 */
export class UpdatePublicHolidayDto {
  @ValidateIfPresent()
  @IsPublicHolidayName()
  readonly name?: string;

  /** Nullable: `null` (or `""`) clears the description. */
  @IsOptional()
  @IsPublicHolidayDescription()
  readonly description?: string | null;

  @ValidateIfPresent()
  @IsHolidayType()
  readonly type?: HolidayType;

  @ValidateIfPresent()
  @IsBoolean()
  readonly isNational?: boolean;

  /**
   * The two ends of the validity range, each nullable so it can be re-opened.
   *
   * `{ "validToYear": 2026 }` is how a holiday is repealed: it applied through
   * 2026 and does not afterwards. `{ "validToYear": null }` undoes that, for a
   * repeal entered by mistake — reinstating a holiday that genuinely came back
   * is a new version instead, so the years it was absent stay absent.
   */
  @IsOptional()
  @IsPublicHolidayYear()
  readonly validFromYear?: number | null;

  @IsOptional()
  @IsPublicHolidayYear()
  readonly validToYear?: number | null;

  /**
   * Redundant when sent, exactly as on create: the service derives recurrence
   * from the resolved `type` and rejects a value that contradicts it.
   */
  @ValidateIfPresent()
  @IsBoolean()
  readonly isRecurring?: boolean;

  /**
   * Either end may be moved on its own, which is why the service resolves the
   * span rather than reading it off this object: a body carrying only `endDate`
   * has to be compared against the `startDate` already stored.
   */
  @ValidateIfPresent()
  @IsIsoDateString()
  readonly startDate?: string;

  @ValidateIfPresent()
  @IsIsoDateString()
  readonly endDate?: string;
}
