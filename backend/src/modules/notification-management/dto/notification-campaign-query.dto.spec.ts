import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  DEFAULT_PAGE_SIZE,
  FIRST_PAGE,
} from '../../../common/constants/pagination.constants';
import { SortOrder } from '../../../common/enums/sort-order.enum';
import { NotificationCampaignStatus } from '../../../generated/prisma/enums';
import {
  CAMPAIGN_SORT_FIELDS,
  DEFAULT_CAMPAIGN_SORT_FIELD,
} from '../notification-management.constants';
import { NotificationCampaignQueryDto } from './notification-campaign-query.dto';

describe('NotificationCampaignQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: NotificationCampaignQueryDto,
  };

  const validate = (
    query: Record<string, string>,
  ): Promise<NotificationCampaignQueryDto> =>
    pipe.transform(query, metadata) as Promise<NotificationCampaignQueryDto>;

  it('defaults to the first page, oldest first, unfiltered', async () => {
    await expect(validate({})).resolves.toEqual({
      page: FIRST_PAGE,
      limit: DEFAULT_PAGE_SIZE,
      sortBy: DEFAULT_CAMPAIGN_SORT_FIELD,
      sortOrder: SortOrder.ASC,
    });
  });

  describe('sorting', () => {
    it.each(CAMPAIGN_SORT_FIELDS)('accepts sortBy=%s', async (sortBy) => {
      await expect(validate({ sortBy })).resolves.toMatchObject({ sortBy });
    });

    it('rejects a column that is not sortable', async () => {
      await expect(validate({ sortBy: 'sentAt' })).rejects.toThrow();
    });
  });

  describe('status', () => {
    it.each(Object.values(NotificationCampaignStatus))(
      'filters on %s',
      async (status) => {
        await expect(validate({ status })).resolves.toMatchObject({ status });
      },
    );

    it('rejects a status outside the enum', async () => {
      await expect(validate({ status: 'PAUSED' })).rejects.toThrow();
    });
  });

  describe('the delivery filters', () => {
    it('converts the two exact spellings', async () => {
      await expect(
        validate({ sendEmail: 'true', sendNotification: 'false' }),
      ).resolves.toMatchObject({ sendEmail: true, sendNotification: false });
    });

    it('rejects anything else', async () => {
      await expect(validate({ sendEmail: '1' })).rejects.toThrow();
    });
  });

  it('rejects a parameter the endpoint does not offer', async () => {
    // Neither is a filter this feature exposes: `recipientType` lives on another
    // table's rows, and campaigns are never scoped to whoever composed them.
    await expect(validate({ recipientType: 'EMPLOYEE' })).rejects.toThrow();
    await expect(validate({ createdByEmployeeId: 'emp-1' })).rejects.toThrow();
  });
});
