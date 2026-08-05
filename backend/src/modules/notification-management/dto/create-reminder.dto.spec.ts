import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import {
  NotificationPriority,
  NotificationType,
} from '../../../generated/prisma/enums';
import {
  NOTIFICATION_MESSAGE_MAX_LENGTH,
  NOTIFICATION_SUBJECT_MAX_LENGTH,
  REMINDER_MAX_DAYS_BEFORE_DEADLINE,
  REMINDER_NAME_MAX_LENGTH,
} from '../notification-management.constants';
import { CreateReminderDto } from './create-reminder.dto';

const VALID = {
  name: 'Timesheet due in 3 days',
  daysBeforeDeadline: 3,
  subject: 'Your timesheet is due in 3 days',
  message: 'Please complete your timesheet before the end of the month.',
};

const validate = (body: Record<string, unknown>) => {
  const dto = plainToInstance(CreateReminderDto, body, {
    // The same options the application's global ValidationPipe applies.
    enableImplicitConversion: false,
  });

  return {
    dto,
    errors: validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  };
};

const failingProperties = (body: Record<string, unknown>): string[] =>
  validate(body).errors.map((error) => error.property);

describe('CreateReminderDto', () => {
  it('accepts a well-formed body', () => {
    expect(validate(VALID).errors).toHaveLength(0);
  });

  describe('required fields', () => {
    it.each(['name', 'daysBeforeDeadline', 'subject', 'message'])(
      'requires %s',
      (field) => {
        const body: Record<string, unknown> = { ...VALID };
        delete body[field];

        expect(failingProperties(body)).toContain(field);
      },
    );

    it('rejects an unknown field rather than ignoring it', () => {
      expect(
        validate({ ...VALID, createdAt: '2026-08-05' }).errors,
      ).not.toHaveLength(0);
    });

    it('rejects a status field: a reminder has no lifecycle', () => {
      expect(validate({ ...VALID, status: 'DRAFT' }).errors).not.toHaveLength(
        0,
      );
    });
  });

  describe('name', () => {
    it('trims before judging, so whitespace is empty', () => {
      expect(failingProperties({ ...VALID, name: '   ' })).toContain('name');
    });

    it('accepts the maximum length', () => {
      const name = 'x'.repeat(REMINDER_NAME_MAX_LENGTH);

      expect(failingProperties({ ...VALID, name })).not.toContain('name');
    });

    it('rejects one character past it', () => {
      const name = 'x'.repeat(REMINDER_NAME_MAX_LENGTH + 1);

      expect(failingProperties({ ...VALID, name })).toContain('name');
    });
  });

  describe('daysBeforeDeadline', () => {
    it('accepts 0 — the deadline itself', () => {
      expect(
        failingProperties({ ...VALID, daysBeforeDeadline: 0 }),
      ).not.toContain('daysBeforeDeadline');
    });

    it('rejects a negative offset', () => {
      expect(failingProperties({ ...VALID, daysBeforeDeadline: -1 })).toContain(
        'daysBeforeDeadline',
      );
    });

    it('rejects a fraction of a day', () => {
      expect(
        failingProperties({ ...VALID, daysBeforeDeadline: 1.5 }),
      ).toContain('daysBeforeDeadline');
    });

    it('rejects more than a year, which the integer column could not hold if unbounded', () => {
      expect(
        failingProperties({
          ...VALID,
          daysBeforeDeadline: REMINDER_MAX_DAYS_BEFORE_DEADLINE + 1,
        }),
      ).toContain('daysBeforeDeadline');
    });
  });

  describe('subject and message', () => {
    it('accepts both at their maximum length', () => {
      expect(
        validate({
          ...VALID,
          subject: 'x'.repeat(NOTIFICATION_SUBJECT_MAX_LENGTH),
          message: 'x'.repeat(NOTIFICATION_MESSAGE_MAX_LENGTH),
        }).errors,
      ).toHaveLength(0);
    });

    it('rejects a subject one character past it', () => {
      expect(
        failingProperties({
          ...VALID,
          subject: 'x'.repeat(NOTIFICATION_SUBJECT_MAX_LENGTH + 1),
        }),
      ).toContain('subject');
    });

    it('rejects a message one character past it', () => {
      expect(
        failingProperties({
          ...VALID,
          message: 'x'.repeat(NOTIFICATION_MESSAGE_MAX_LENGTH + 1),
        }),
      ).toContain('message');
    });

    it('rejects an empty subject', () => {
      expect(failingProperties({ ...VALID, subject: '' })).toContain('subject');
    });
  });

  describe('description', () => {
    it('is optional', () => {
      expect(validate(VALID).errors).toHaveLength(0);
    });

    it('collapses a cleared textarea to null rather than storing an empty string', () => {
      expect(
        validate({ ...VALID, description: '   ' }).dto.description,
      ).toBeNull();
    });
  });

  describe('closed vocabularies', () => {
    it('rejects a severity outside NotificationType', () => {
      expect(failingProperties({ ...VALID, severity: 'CRITICAL' })).toContain(
        'severity',
      );
    });

    it('rejects a priority outside NotificationPriority', () => {
      expect(failingProperties({ ...VALID, priority: 'URGENT' })).toContain(
        'priority',
      );
    });
  });

  describe('defaults', () => {
    it('is an enabled, informational, medium-priority in-app reminder', () => {
      const { dto } = validate(VALID);

      expect(dto).toMatchObject({
        enabled: true,
        severity: NotificationType.INFO,
        priority: NotificationPriority.MEDIUM,
        sendEmail: false,
        sendNotification: true,
      });
    });

    it('lets a caller create a disabled reminder by saying so', () => {
      expect(validate({ ...VALID, enabled: false }).dto.enabled).toBe(false);
    });
  });

  it('does not judge the delivery methods — that rule belongs to the service', () => {
    // Both false is refused, but by `ReminderService`: on a PATCH the rule
    // applies to the merged pair, which no single-field validator can see.
    expect(
      validate({ ...VALID, sendEmail: false, sendNotification: false }).errors,
    ).toHaveLength(0);
  });
});
