import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import {
  NotificationCategory,
  NotificationPriority,
  NotificationRecipientType,
  NotificationType,
  NotificationWorkspace,
  UserRole,
} from '../../../generated/prisma/enums';
import {
  NOTIFICATION_MESSAGE_MAX_LENGTH,
  NOTIFICATION_TITLE_MAX_LENGTH,
} from '../notification.constants';
import { CreateNotificationDto } from './create-notification.dto';

const VALID = {
  workspace: NotificationWorkspace.PERSONAL,
  recipientType: NotificationRecipientType.USER,
  recipientUserId: 'usr-1',
  title: 'Leave approved',
  message: 'Your leave from 7 to 11 September has been approved.',
};

const validate = (body: Record<string, unknown>) => {
  const dto = plainToInstance(CreateNotificationDto, body, {
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

describe('CreateNotificationDto', () => {
  it('accepts a well-formed body', () => {
    expect(validate(VALID).errors).toHaveLength(0);
  });

  describe('required fields', () => {
    it.each(['workspace', 'recipientType', 'title', 'message'])(
      'requires %s',
      (field) => {
        const body: Record<string, unknown> = { ...VALID };
        delete body[field];

        expect(failingProperties(body)).toContain(field);
      },
    );

    it('rejects an unknown field rather than ignoring it', () => {
      expect(validate({ ...VALID, isRead: true }).errors).not.toHaveLength(0);
    });
  });

  describe('title', () => {
    it('rejects an empty string', () => {
      expect(failingProperties({ ...VALID, title: '' })).toContain('title');
    });

    it('rejects whitespace, which is trimmed before it is judged', () => {
      expect(failingProperties({ ...VALID, title: '   ' })).toContain('title');
    });

    it('trims a value it accepts', () => {
      expect(
        validate({ ...VALID, title: '  Leave approved  ' }).dto.title,
      ).toBe('Leave approved');
    });

    it('accepts the bound exactly', () => {
      expect(
        failingProperties({
          ...VALID,
          title: 'x'.repeat(NOTIFICATION_TITLE_MAX_LENGTH),
        }),
      ).not.toContain('title');
    });

    it('rejects one character past it', () => {
      expect(
        failingProperties({
          ...VALID,
          title: 'x'.repeat(NOTIFICATION_TITLE_MAX_LENGTH + 1),
        }),
      ).toContain('title');
    });
  });

  describe('message', () => {
    it('rejects an empty string', () => {
      expect(failingProperties({ ...VALID, message: '' })).toContain('message');
    });

    it('accepts the bound exactly', () => {
      expect(
        failingProperties({
          ...VALID,
          message: 'x'.repeat(NOTIFICATION_MESSAGE_MAX_LENGTH),
        }),
      ).not.toContain('message');
    });

    it('rejects one character past it', () => {
      expect(
        failingProperties({
          ...VALID,
          message: 'x'.repeat(NOTIFICATION_MESSAGE_MAX_LENGTH + 1),
        }),
      ).toContain('message');
    });
  });

  describe('recipientRole', () => {
    it.each([UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.HR])(
      'accepts %s',
      (role) => {
        expect(
          failingProperties({
            workspace: NotificationWorkspace.ADMINISTRATIVE,
            recipientType: NotificationRecipientType.ROLE,
            recipientRole: role,
            title: VALID.title,
            message: VALID.message,
          }),
        ).not.toContain('recipientRole');
      },
    );

    it('rejects USER, which is a role but not an administrative one', () => {
      expect(
        failingProperties({ ...VALID, recipientRole: UserRole.USER }),
      ).toContain('recipientRole');
    });

    it('rejects a role the schema does not know', () => {
      expect(
        failingProperties({ ...VALID, recipientRole: 'MANAGER' }),
      ).toContain('recipientRole');
    });
  });

  describe('the closed vocabularies', () => {
    it.each([
      ['workspace', 'INBOX'],
      ['recipientType', 'EVERYONE'],
      ['category', 'PAYROLL'],
      ['type', 'FATAL'],
      ['priority', 'URGENT'],
    ])('rejects an unknown %s', (field, value) => {
      expect(failingProperties({ ...VALID, [field]: value })).toContain(field);
    });
  });

  describe('defaults', () => {
    it('describes an ordinary informational notice of normal importance', () => {
      const { dto } = validate(VALID);

      expect(dto.category).toBe(NotificationCategory.GENERAL);
      expect(dto.type).toBe(NotificationType.INFO);
      expect(dto.priority).toBe(NotificationPriority.MEDIUM);
    });

    it('leaves a stated value alone', () => {
      const { dto } = validate({
        ...VALID,
        category: NotificationCategory.LEAVE,
        type: NotificationType.SUCCESS,
        priority: NotificationPriority.HIGH,
      });

      expect(dto.category).toBe(NotificationCategory.LEAVE);
      expect(dto.type).toBe(NotificationType.SUCCESS);
      expect(dto.priority).toBe(NotificationPriority.HIGH);
    });
  });

  /**
   * The combination rules are the service's, not this class's — see the DTO for
   * why. These cases pin that they really are absent here, so a later reader
   * does not add a second, partial copy of them.
   */
  describe('addressing combinations are not judged here', () => {
    it('accepts a USER notification with no recipientUserId', () => {
      const body: Record<string, unknown> = { ...VALID };
      delete body.recipientUserId;

      expect(validate(body).errors).toHaveLength(0);
    });

    it('accepts a combination the service will refuse', () => {
      expect(
        validate({
          ...VALID,
          workspace: NotificationWorkspace.PERSONAL,
          recipientType: NotificationRecipientType.ROLE,
          recipientRole: UserRole.HR,
        }).errors,
      ).toHaveLength(0);
    });
  });
});
