import type { ComponentProps } from 'react';

import { FormField } from '@/components/form/FormField';

import { HOURS_DECIMAL_PLACES, MAX_HOURS_PER_DAY } from '../work-schedule-api';

/** `0.25` — the granularity the `decimal(5,2)` columns are sized for. */
const HOURS_STEP = 0.25;

export interface HoursFieldProps
  extends Omit<ComponentProps<typeof FormField>, 'type' | 'step' | 'min' | 'max'> {
  /**
   * The upper bound — 24 for a day, 168 for a week.
   *
   * Named `maxHours` rather than `max` on purpose: `register()` returns a
   * `max?: string | number` of its own, so a prop called `max` here would
   * collide with it on every call site that spreads a registration.
   */
  maxHours?: number;
  /** `true` only for the lunch break, the one hour value that may be zero. */
  allowZero?: boolean;
}

/**
 * One hour input, with the four attributes every one of the six shares.
 *
 * The six fields differ in their label, their hint and their bound; they agree
 * on being a number spun in quarter-hours between zero and a day. Writing that
 * out six times is six chances for one of them to acquire a different `step` by
 * accident — the kind of drift that is invisible until somebody notices one
 * field arrows by 0.5 and its neighbour by 0.25.
 *
 * ## `min` and `max` are hints, not the validation
 *
 * The form carries `noValidate`, so the browser's own constraint checking never
 * refuses a submit — these attributes exist so the spinner clamps sensibly and
 * so assistive technology can announce the range. The refusal is Zod's, with a
 * translated message, mirroring the backend's `@IsHours()`. Two mechanisms would
 * otherwise disagree in two languages.
 *
 * `inputMode="decimal"` puts a numeric keypad with a separator on a phone, which
 * an `<input type="number">` does not reliably do on its own.
 */
export const HoursField = ({
  maxHours = MAX_HOURS_PER_DAY,
  allowZero = false,
  ...props
}: HoursFieldProps) => (
  /*
   * The spread comes first so the five attributes this component owns cannot be
   * overwritten by a `register()` result that happens to carry `min` or `max`.
   */
  <FormField
    {...props}
    type="number"
    inputMode="decimal"
    step={HOURS_STEP}
    min={allowZero ? 0 : 10 ** -HOURS_DECIMAL_PLACES}
    max={maxHours}
  />
);
