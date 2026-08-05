import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import {
  CampaignRecipientType,
  NotificationPriority,
  NotificationType,
} from '../../../generated/prisma/enums';
import {
  CAMPAIGN_MAX_RECIPIENTS,
  NOTIFICATION_MESSAGE_MAX_LENGTH,
  NOTIFICATION_SUBJECT_MAX_LENGTH,
} from '../notification-management.constants';
import { CreateNotificationCampaignDto } from './create-notification-campaign.dto';

const VALID = {
  subject: 'Planned maintenance',
  message: 'The system will be unavailable on Saturday morning.',
  recipientType: CampaignRecipientType.EMPLOYEE,
  employeeIds: ['emp-1'],
};

const validate = (body: Record<string, unknown>) => {
  const dto = plainToInstance(CreateNotificationCampaignDto, body, {
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

describe('CreateNotificationCampaignDto', () => {
  it('accepts a well-formed body', () => {
    expect(validate(VALID).errors).toHaveLength(0);
  });

  describe('required fields', () => {
    it.each(['subject', 'message', 'recipientType'])('requires %s', (field) => {
      const body: Record<string, unknown> = { ...VALID };
      delete body[field];

      expect(failingProperties(body)).toContain(field);
    });

    it('rejects an unknown field rather than ignoring it', () => {
      expect(validate({ ...VALID, sender: 'me' }).errors).not.toHaveLength(0);
    });
  });

  describe('the fields a client may not write', () => {
    it.each(['status', 'sentAt', 'createdByEmployeeId', 'createdAt'])(
      'rejects %s',
      (field) => {
        expect(
          validate({ ...VALID, [field]: 'anything' }).errors,
        ).not.toHaveLength(0);
      },
    );
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

    it('rejects whitespace, which is trimmed before it is judged', () => {
      expect(failingProperties({ ...VALID, subject: '   ' })).toContain(
        'subject',
      );
    });
  });

  describe('recipients', () => {
    it('accepts one employee', () => {
      expect(
        validate({ ...VALID, employeeIds: ['emp-1'] }).errors,
      ).toHaveLength(0);
    });

    it('accepts several', () => {
      expect(
        validate({ ...VALID, employeeIds: ['emp-1', 'emp-2', 'emp-3'] }).errors,
      ).toHaveLength(0);
    });

    it('accepts ALL_EMPLOYEES with no ids at all', () => {
      expect(
        validate({
          subject: VALID.subject,
          message: VALID.message,
          recipientType: CampaignRecipientType.ALL_EMPLOYEES,
        }).errors,
      ).toHaveLength(0);
    });

    it('rejects an empty list — a campaign addressed to nobody', () => {
      expect(failingProperties({ ...VALID, employeeIds: [] })).toContain(
        'employeeIds',
      );
    });

    it('rejects the same person twice', () => {
      expect(
        failingProperties({ ...VALID, employeeIds: ['emp-1', 'emp-1'] }),
      ).toContain('employeeIds');
    });

    it('rejects more names than one campaign may carry', () => {
      const employeeIds = Array.from(
        { length: CAMPAIGN_MAX_RECIPIENTS + 1 },
        (_, index) => `emp-${String(index)}`,
      );

      expect(failingProperties({ ...VALID, employeeIds })).toContain(
        'employeeIds',
      );
    });

    it('rejects a recipient type outside the enum', () => {
      expect(failingProperties({ ...VALID, recipientType: 'ROLE' })).toContain(
        'recipientType',
      );
    });

    it('does not judge ids against the recipient type — that rule belongs to the service', () => {
      // ALL_EMPLOYEES carrying ids is refused, but by the service: it is a rule
      // about two fields at once, judged on a resolved body.
      expect(
        validate({
          ...VALID,
          recipientType: CampaignRecipientType.ALL_EMPLOYEES,
        }).errors,
      ).toHaveLength(0);
    });
  });

  describe('dates', () => {
    it('accepts an ISO-8601 timestamp', () => {
      expect(
        validate({ ...VALID, scheduledAt: '2099-01-01T08:00:00.000Z' }).errors,
      ).toHaveLength(0);
    });

    it('rejects a date whose meaning depends on where it is read', () => {
      expect(
        failingProperties({ ...VALID, scheduledAt: '01/13/2020' }),
      ).toContain('scheduledAt');
    });

    it('keeps the value a string, to be parsed once in the service', () => {
      const { dto } = validate({
        ...VALID,
        scheduledAt: '2099-01-01T08:00:00.000Z',
      });

      expect(typeof dto.scheduledAt).toBe('string');
    });

    it('does not judge the two against each other — that rule belongs to the service', () => {
      expect(
        validate({
          ...VALID,
          scheduledAt: '2099-01-02T08:00:00.000Z',
          expiresAt: '2099-01-01T08:00:00.000Z',
        }).errors,
      ).toHaveLength(0);
    });
  });

  describe('defaults', () => {
    it('is an informational, medium-priority in-app announcement', () => {
      expect(validate(VALID).dto).toMatchObject({
        severity: NotificationType.INFO,
        priority: NotificationPriority.MEDIUM,
        sendEmail: false,
        sendNotification: true,
      });
    });
  });
});
