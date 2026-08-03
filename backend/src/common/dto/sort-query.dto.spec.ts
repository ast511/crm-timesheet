import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { SortOrder } from '../enums/sort-order.enum';
import { SortQueryDto } from './sort-query.dto';

/**
 * Exercises the base class directly, so the rules it contributes are pinned
 * once rather than re-asserted in every module that extends it.
 */
describe('SortQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: SortQueryDto,
  };

  const validate = (query: Record<string, string>): Promise<SortQueryDto> =>
    pipe.transform(query, metadata) as Promise<SortQueryDto>;

  it('defaults to ascending when no direction is given', async () => {
    const query = await validate({});

    expect(query.sortOrder).toBe(SortOrder.ASC);
  });

  it('still carries the inherited pagination defaults', async () => {
    const query = await validate({});

    expect(query.page).toBe(1);
    expect(query.limit).toBe(20);
  });

  it.each(['asc', 'desc'])('accepts %s', async (sortOrder) => {
    const query = await validate({ sortOrder });

    expect(query.sortOrder).toBe(sortOrder);
  });

  it('rejects a direction outside the enum', async () => {
    await expect(validate({ sortOrder: 'sideways' })).rejects.toThrow();
  });
});
