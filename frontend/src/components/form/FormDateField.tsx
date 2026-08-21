import { type ComponentProps } from 'react';

import { FormField } from './FormField';

export type FormDateFieldProps = Omit<ComponentProps<typeof FormField>, 'type'>;

/**
 * A calendar date field — `FormField` with `type="date"` and the attributes
 * that make a date input behave.
 *
 * ## Why the native input rather than a rendered calendar
 *
 * A date picker is the one control where the platform's version beats a
 * hand-built one on every axis that matters here. It is keyboard-operable by
 * segment, it is announced correctly, it opens the operating system's own
 * picker on a phone instead of a grid designed for a mouse, and it needs no
 * dependency — this project ships no calendar component and no date library,
 * and adding either for two fields would be the largest change in the feature.
 *
 * The value it reads and writes is `yyyy-MM-dd`: **a calendar date, with no
 * time and no zone**, which is exactly what a public holiday is. That is the
 * property this component exists to preserve. A picker handing back a `Date`
 * would hand back an instant in the browser's zone, and turning one of those
 * into a day is the classic defect where 1 January is stored — or shown — as
 * 31 December for everybody west of Greenwich. Here there is nothing to
 * convert: the string *is* a day, `toCalendarDateIso` appends midnight UTC to
 * it on the way out and `toCalendarDateInput` takes it back apart on the way
 * in, and neither consults a time zone.
 *
 * The one thing the platform decides for itself is the *display* format, which
 * follows the browser's locale rather than the `ro-RO` this application prints
 * everywhere else. The value is unaffected, and a bespoke calendar is not worth
 * it: what a field shows while a date is being picked matters less than every
 * *rendered* date agreeing, which `formatCalendarDate` guarantees.
 *
 * `min` / `max` are left to the caller — the bounds belong to the field rather
 * than to the control.
 */
export const FormDateField = ({ className, ...props }: FormDateFieldProps) => (
  <FormField
    type="date"
    /*
     * A date input is never a place to complete an address from and its
     * segments are not words, so both of the browser's helpful behaviours are
     * turned off rather than left to produce nonsense.
     */
    autoComplete="off"
    spellCheck={false}
    className={className}
    {...props}
  />
);
