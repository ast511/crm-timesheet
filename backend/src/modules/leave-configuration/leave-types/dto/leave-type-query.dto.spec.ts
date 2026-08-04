import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { SortOrder } from '../../../../common/enums/sort-order.enum';
import { LeaveTypeQueryDto } from './leave-type-query.dto';

/**
 * The list endpoint's query string, through a `ValidationPipe` configured like
 * the global one.
 *
 * Query parameters are always text, so the transforms are what make
 * `?isPaid=false` a boolean rather than a truthy string — the classic bug where
 * every filter silently means `true`.
 */
describe('LeaveTypeQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: LeaveTypeQueryDto,
  };

  const validate = (query: unknown): Promise<LeaveTypeQueryDto> =>
    pipe.transform(query, metadata) as Promise<LeaveTypeQueryDto>;

  it('applies the shared defaults and this module’s own sort field', async () => {
    const dto = await validate({});

    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.sortBy).toBe('label');
    expect(dto.sortOrder).toBe(SortOrder.ASC);
  });

  it.each(['code', 'label', 'defaultAllocatedDays', 'createdAt'])(
    'accepts %s as a sort field',
    async (sortBy) => {
      const dto = await validate({ sortBy });

      expect(dto.sortBy).toBe(sortBy);
    },
  );

  /** The value reaches Prisma's `orderBy` key, so the list has to be closed. */
  it.each(['icon', 'isPaid', 'id', 'password'])(
    'rejects %s as a sort field',
    async (sortBy) => {
      await expect(validate({ sortBy })).rejects.toThrow();
    },
  );

  it.each([
    ['isActive', 'true', true],
    ['isActive', 'false', false],
    ['requiresApproval', 'false', false],
    ['isPaid', 'true', true],
  ])('turns ?%s=%s into a boolean', async (field, raw, expected) => {
    const dto = (await validate({ [field]: raw })) as unknown as Record<
      string,
      unknown
    >;

    expect(dto[field]).toBe(expected);
  });

  /** Only the two exact spellings convert; anything else is a 400. */
  it.each(['yes', '1', 'TRUE', ''])('rejects ?isPaid=%s', async (isPaid) => {
    await expect(validate({ isPaid })).rejects.toThrow();
  });

  it('leaves an unstated filter undefined rather than defaulting it', async () => {
    const dto = await validate({});

    expect(dto.isActive).toBeUndefined();
    expect(dto.requiresApproval).toBeUndefined();
    expect(dto.isPaid).toBeUndefined();
  });

  it('trims the search term', async () => {
    const dto = await validate({ search: '  annual  ' });

    expect(dto.search).toBe('annual');
  });

  it('rejects an unknown parameter', async () => {
    await expect(validate({ year: '2026' })).rejects.toThrow();
  });
});
