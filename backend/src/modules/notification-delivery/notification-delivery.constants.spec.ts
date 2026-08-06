import { NotificationCategory } from '../../generated/prisma/enums';
import { NOTIFICATION_SUBJECT_MAX_LENGTH } from '../notification-management/notification-management.constants';
import { NOTIFICATION_TITLE_MAX_LENGTH } from '../notifications/notification.constants';
import {
  DELIVERY_CATEGORIES,
  DeliverySource,
  toNotificationTitle,
} from './notification-delivery.constants';

describe('DELIVERY_CATEGORIES', () => {
  it('files an announcement as general and a reminder as a reminder', () => {
    expect(DELIVERY_CATEGORIES[DeliverySource.Campaign]).toBe(
      NotificationCategory.GENERAL,
    );
    expect(DELIVERY_CATEGORIES[DeliverySource.Reminder]).toBe(
      NotificationCategory.REMINDER,
    );
  });
});

describe('toNotificationTitle', () => {
  // The seam Feature 027 named and left open: a subject may be 200 characters
  // and a notification title is bounded at 150.
  it('exists because the two bounds disagree', () => {
    expect(NOTIFICATION_SUBJECT_MAX_LENGTH).toBeGreaterThan(
      NOTIFICATION_TITLE_MAX_LENGTH,
    );
  });

  it('leaves a heading that already fits alone', () => {
    expect(toNotificationTitle('Planned maintenance')).toBe(
      'Planned maintenance',
    );
  });

  it('leaves a heading of exactly the bound alone', () => {
    const subject = 'A'.repeat(NOTIFICATION_TITLE_MAX_LENGTH);

    expect(toNotificationTitle(subject)).toBe(subject);
  });

  it('truncates one character past the bound', () => {
    const subject = 'A'.repeat(NOTIFICATION_TITLE_MAX_LENGTH + 1);

    expect(toNotificationTitle(subject)).toHaveLength(
      NOTIFICATION_TITLE_MAX_LENGTH,
    );
  });

  it('truncates the longest subject the API accepts', () => {
    const title = toNotificationTitle(
      'A'.repeat(NOTIFICATION_SUBJECT_MAX_LENGTH),
    );

    expect(title).toHaveLength(NOTIFICATION_TITLE_MAX_LENGTH);
    expect(title.endsWith('…')).toBe(true);
  });

  // A heading cut at exactly the bound reads as a sentence somebody forgot to
  // finish; one that says it was cut reads as a heading with more behind it.
  it('says that it was cut', () => {
    expect(toNotificationTitle(`${'word '.repeat(40)}end`)).toMatch(/…$/);
  });

  it('does not leave a trailing space in front of the ellipsis', () => {
    const subject = `${'A'.repeat(NOTIFICATION_TITLE_MAX_LENGTH - 1)} tail`;

    expect(toNotificationTitle(subject)).not.toMatch(/ …$/);
  });
});
