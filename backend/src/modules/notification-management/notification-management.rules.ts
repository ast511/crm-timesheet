import { BadRequestException } from '@nestjs/common';

/**
 * The one rule both resources in this module share.
 *
 * Reminders and campaigns are otherwise independent — different tables,
 * different lifecycles, different services, and nothing in one reads the other —
 * so this file holds exactly what is genuinely common rather than becoming the
 * drawer everything ends up in.
 */

/**
 * Refuses a reminder or a campaign that would reach nobody by any channel.
 *
 * `sendEmail` and `sendNotification` are two independent switches, so "both off"
 * is a shape the columns can hold and the API must not: a rule or an
 * announcement with no delivery method is one that silently never happens, and
 * it would sit on the screen looking configured. Better a `400` when it is
 * written than an administrator wondering for a month why nobody was told.
 *
 * It cannot be a CHECK constraint for the same reason the notification centre's
 * addressing rules are not: on a `PATCH` the rule applies to the state the patch
 * would *leave behind*, which the caller may have stated only half of — sending
 * `{ sendEmail: false }` against a stored `sendNotification: false` is the
 * failing case, and neither field alone is wrong. Both services therefore judge
 * the merged pair, and they call this so the message and the rule cannot drift.
 *
 * The message is an array, the same shape the global `ValidationPipe` produces,
 * so a form marks the two inputs with the code it already has for field errors.
 */
export function assertDeliveryMethodChosen(
  sendEmail: boolean,
  sendNotification: boolean,
): void {
  if (!sendEmail && !sendNotification) {
    throw new BadRequestException([
      'At least one delivery method is required: set sendEmail or sendNotification to true',
    ]);
  }
}
