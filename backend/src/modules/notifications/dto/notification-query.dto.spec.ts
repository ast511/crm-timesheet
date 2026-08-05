import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  DEFAULT_PAGE_SIZE,
  FIRST_PAGE,
  MAX_PAGE_SIZE,
} from '../../../common/constants/pagination.constants';
import { SortOrder } from '../../../common/enums/sort-order.enum';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationType,
} from '../../../generated/prisma/enums';
import {
  DEFAULT_NOTIFICATION_SORT_FIELD,
  NOTIFICATION_SEARCH_MAX_LENGTH,
  NOTIFICATION_SORT_FIELDS,
} from '../notification.constants';
import { NotificationQueryDto } from './notification-query.dto';

describe('NotificationQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: NotificationQueryDto,
  };

  const validate = (
    query: Record<string, string>,
  ): Promise<NotificationQueryDto> =>
    pipe.transform(query, metadata) as Promise<NotificationQueryDto>;

  it('defaults to the first page, newest first, unfiltered', async () => {
    await expect(validate({})).resolves.toEqual({
      page: FIRST_PAGE,
      limit: DEFAULT_PAGE_SIZE,
      sortBy: DEFAULT_NOTIFICATION_SORT_FIELD,
      sortOrder: SortOrder.DESC,
    });
  });

  it('defaults to desc, unlike every other list in this API', async () => {
    // An inbox is a feed rather than a register: the row that matters is the
    // one that arrived last. Pinned because the shared `SortQueryDto` default
    // is ASC, and a future change to it must not silently flip this one.
    const query = await validate({});

    expect(query.sortOrder).toBe(SortOrder.DESC);
  });

  it('still honours an explicit ascending order', async () => {
    await expect(validate({ sortOrder: 'asc' })).resolves.toMatchObject({
      sortOrder: SortOrder.ASC,
    });
  });

  it('inherits the pagination rules instead of redefining them', async () => {
    await expect(validate({ page: '2', limit: '50' })).resolves.toMatchObject({
      page: 2,
      limit: 50,
    });

    await expect(
      validate({ limit: String(MAX_PAGE_SIZE + 1) }),
    ).rejects.toThrow();
  });

  describe('sortBy', () => {
    it.each([...NOTIFICATION_SORT_FIELDS])('accepts %s', async (field) => {
      await expect(validate({ sortBy: field })).resolves.toMatchObject({
        sortBy: field,
      });
    });

    it('rejects a column that is not enumerated', async () => {
      await expect(validate({ sortBy: 'title; DROP TABLE' })).rejects.toThrow();
    });

    it('rejects isRead, which is a filter rather than an ordering', async () => {
      await expect(validate({ sortBy: 'isRead' })).rejects.toThrow();
    });
  });

  describe('isRead', () => {
    it.each([
      ['true', true],
      ['false', false],
    ])('converts the string %s', async (sent, expected) => {
      await expect(validate({ isRead: sent })).resolves.toMatchObject({
        isRead: expected,
      });
    });

    it('is absent rather than false when it is not sent', async () => {
      expect((await validate({})).isRead).toBeUndefined();
    });

    it('rejects a spelling that is not one of the two', async () => {
      await expect(validate({ isRead: 'yes' })).rejects.toThrow();
    });
  });

  describe('the closed vocabularies', () => {
    it('accepts each of them', async () => {
      await expect(
        validate({
          category: NotificationCategory.LEAVE,
          type: NotificationType.ERROR,
          priority: NotificationPriority.HIGH,
        }),
      ).resolves.toMatchObject({
        category: NotificationCategory.LEAVE,
        type: NotificationType.ERROR,
        priority: NotificationPriority.HIGH,
      });
    });

    it.each([
      ['category', 'PAYROLL'],
      ['type', 'FATAL'],
      ['priority', 'URGENT'],
    ])('rejects an unknown %s', async (field, value) => {
      await expect(validate({ [field]: value })).rejects.toThrow();
    });
  });

  describe('search', () => {
    it('is trimmed', async () => {
      await expect(validate({ search: '  leave  ' })).resolves.toMatchObject({
        search: 'leave',
      });
    });

    it('rejects a term longer than the bound', async () => {
      await expect(
        validate({ search: 'x'.repeat(NOTIFICATION_SEARCH_MAX_LENGTH + 1) }),
      ).rejects.toThrow();
    });
  });

  it('rejects ?workspace=, because the URL already states the scope', async () => {
    // Feature 015's rule: a scope in the path must never also be a filter.
    // `GET /notifications?workspace=ADMINISTRATIVE` could only ever return an
    // empty page, so it is a 400 rather than a query that quietly means nothing.
    await expect(validate({ workspace: 'ADMINISTRATIVE' })).rejects.toThrow();
  });

  it('rejects a recipient filter, which would be a way to read somebody else’s mail', async () => {
    await expect(validate({ recipientUserId: 'usr-2' })).rejects.toThrow();
  });
});
