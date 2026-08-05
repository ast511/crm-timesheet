import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  DEFAULT_PAGE_SIZE,
  FIRST_PAGE,
  MAX_PAGE_SIZE,
} from '../../../common/constants/pagination.constants';
import { SortOrder } from '../../../common/enums/sort-order.enum';
import { NotificationType } from '../../../generated/prisma/enums';
import {
  DEFAULT_REMINDER_SORT_FIELD,
  NOTIFICATION_MANAGEMENT_SEARCH_MAX_LENGTH,
  REMINDER_SORT_FIELDS,
} from '../notification-management.constants';
import { ReminderQueryDto } from './reminder-query.dto';

describe('ReminderQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: ReminderQueryDto,
  };

  const validate = (query: Record<string, string>): Promise<ReminderQueryDto> =>
    pipe.transform(query, metadata) as Promise<ReminderQueryDto>;

  it('defaults to the first page, oldest first, unfiltered', async () => {
    await expect(validate({})).resolves.toEqual({
      page: FIRST_PAGE,
      limit: DEFAULT_PAGE_SIZE,
      sortBy: DEFAULT_REMINDER_SORT_FIELD,
      sortOrder: SortOrder.ASC,
    });
  });

  it('keeps the project-wide ascending default, unlike the notification centre', async () => {
    // An inbox is a feed and overrides it; a configuration register is not, and
    // a second endpoint departing from the shared default would make "which way
    // does this one sort" a question a client has to ask per endpoint.
    const query = await validate({});

    expect(query.sortOrder).toBe(SortOrder.ASC);
  });

  describe('inherited pagination', () => {
    it('coerces the numbers a query string carries as text', async () => {
      await expect(validate({ page: '3', limit: '50' })).resolves.toMatchObject(
        {
          page: 3,
          limit: 50,
        },
      );
    });

    it('rejects a limit past the cap rather than clamping it', async () => {
      await expect(
        validate({ limit: String(MAX_PAGE_SIZE + 1) }),
      ).rejects.toThrow();
    });
  });

  describe('sorting', () => {
    it.each(REMINDER_SORT_FIELDS)('accepts sortBy=%s', async (sortBy) => {
      await expect(validate({ sortBy })).resolves.toMatchObject({ sortBy });
    });

    it('rejects a column that is not sortable', async () => {
      await expect(validate({ sortBy: 'message' })).rejects.toThrow();
    });

    it('rejects scheduledAt, which reminders do not have', async () => {
      await expect(validate({ sortBy: 'scheduledAt' })).rejects.toThrow();
    });
  });

  describe('enabled', () => {
    it('converts the two exact spellings', async () => {
      await expect(validate({ enabled: 'true' })).resolves.toMatchObject({
        enabled: true,
      });
      await expect(validate({ enabled: 'false' })).resolves.toMatchObject({
        enabled: false,
      });
    });

    it('rejects anything else rather than filtering on a guess', async () => {
      await expect(validate({ enabled: 'yes' })).rejects.toThrow();
    });

    it('is absent when it was not asked for, which means both', async () => {
      const query = await validate({});

      expect(query.enabled).toBeUndefined();
    });
  });

  describe('filters', () => {
    it('accepts a severity from the enum', async () => {
      await expect(
        validate({ severity: NotificationType.WARNING }),
      ).resolves.toMatchObject({ severity: NotificationType.WARNING });
    });

    it('rejects one outside it', async () => {
      await expect(validate({ severity: 'CRITICAL' })).rejects.toThrow();
    });

    it('rejects a parameter the endpoint does not offer', async () => {
      await expect(validate({ status: 'DRAFT' })).rejects.toThrow();
    });
  });

  describe('search', () => {
    it('trims the term', async () => {
      await expect(
        validate({ search: '  timesheet  ' }),
      ).resolves.toMatchObject({ search: 'timesheet' });
    });

    it('rejects a term long enough to be pushed into a LIKE scan', async () => {
      await expect(
        validate({
          search: 'x'.repeat(NOTIFICATION_MANAGEMENT_SEARCH_MAX_LENGTH + 1),
        }),
      ).rejects.toThrow();
    });
  });
});
