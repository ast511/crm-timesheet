import { applyDecorators } from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsBoolean,
  IsOptional,
} from 'class-validator';

import { IsRelationId } from '../../../common/decorators/is-relation-id.decorator';
import { ValidateIfPresent } from '../../../common/decorators/validate-if-present.decorator';
import { LEAVE_BALANCE_GENERATION_MAX_IDS } from '../employee-leave-balance.constants';
import { IsLeaveBalanceYear } from './employee-leave-balance-field.decorators';

/**
 * A narrowing list — `employeeIds` or `leaveTypeIds` — as it arrives.
 *
 * Three rules, and the omission is as deliberate as the rules:
 *
 * - **bounded**, because each list becomes an `IN (...)`, and a list longer than
 *   this is a caller reaching for "everybody" without saying so.
 * - **no duplicates**, rejected as a `400` naming the field rather than silently
 *   de-duplicated. Naming somebody twice is not a stronger request, it is a
 *   client bug, and the report's counts would not add up if it were tolerated.
 * - **each a well-formed foreign key.** Whether the row exists is a question for
 *   the service, which answers it as a warning naming the id rather than as a
 *   failure — a run must not be lost because one id in a list of two hundred was
 *   stale.
 *
 * There is **no minimum size**. An empty array is a caller asking to generate
 * for nobody, which the service reports as a run that did nothing; only omitting
 * the field entirely means "all of them". Those are different requests and the
 * API keeps them distinguishable, because the alternative is an empty list from
 * a filtered UI quietly generating for the whole company.
 */
function IsGenerationScopeIds() {
  return applyDecorators(
    ArrayMaxSize(LEAVE_BALANCE_GENERATION_MAX_IDS),
    ArrayUnique(),
    IsRelationId({ each: true }),
  );
}

/**
 * Body of `POST /api/v1/employee-leave-balances/generate`.
 *
 * One required field. `year` is the year being *opened* — the year the new rows
 * are filed under — and the carry-over policy is applied to the year before it.
 * Stating the target rather than the source is what makes the January call read
 * the way HR says it: "generate 2027".
 *
 * **`allocatedDays` is not a field here, and that is the point of the feature.**
 * The number comes from each leave type's `defaultAllocatedDays`, so the run
 * cannot invent an entitlement and cannot be given one; a type that suggests
 * nothing produces no row and a warning saying so. Anything HR wants to differ
 * from the default is a `PATCH` on the balance afterwards, where it is visible
 * as a decision somebody made.
 *
 * **Nor is there a `carriedOverDays`.** What survives a year-end is decided by
 * the leave type's `allowsCarryOver` and `maxCarryOverDays`, which is where a
 * policy belongs — one place, readable, and the same for everybody it applies
 * to.
 *
 * Unknown properties never reach this class: the global `ValidationPipe` runs
 * with `forbidNonWhitelisted`, so a client that sends `allocatedDays` is told
 * rather than having it ignored.
 */
export class GenerateLeaveBalancesDto {
  /**
   * The year to open. The carry-over policy is applied to `year - 1`, which is
   * therefore the year that gets closed by the same run.
   */
  @IsLeaveBalanceYear()
  readonly year!: number;

  /**
   * Whom to generate for. Omitted, every employee who has not been terminated —
   * which is the ordinary January call.
   *
   * Naming a single id is the other use this endpoint has: somebody was hired
   * today and needs this year's balances now.
   */
  @IsOptional()
  @IsGenerationScopeIds()
  readonly employeeIds?: string[];

  /**
   * Which kinds of leave. Omitted, every active type.
   *
   * A retired type named here explicitly is reported as a warning rather than
   * silently skipped: the caller typed it, so they are owed an answer about it.
   * A retired type merely swept up by the default is skipped in silence, because
   * nobody asked about it.
   */
  @IsOptional()
  @IsGenerationScopeIds()
  readonly leaveTypeIds?: string[];

  /**
   * Compute the whole run and write nothing.
   *
   * Defaulted to `false` rather than `true`, which is the one place this DTO
   * risks surprising somebody. A default of `true` would be safer for a
   * mistyped request and worse for every correct one: a caller who meant to
   * write would get a report indistinguishable from a successful run and would
   * discover in March that no balance was ever created. An explicit flag makes
   * the choice visible in the request, which is what a preview is for.
   *
   * `@ValidateIfPresent()` rather than `@IsOptional()`, which also skips its
   * constraints for `null` — and a `null` here would be read as "not a preview"
   * and quietly write. There is no nullable spelling of this flag: it is absent,
   * or it is a boolean.
   */
  @ValidateIfPresent()
  @IsBoolean()
  readonly dryRun?: boolean;
}
