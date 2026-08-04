import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  DEFAULT_PAGE_SIZE,
  FIRST_PAGE,
} from '../../../common/constants/pagination.constants';
import { SortOrder } from '../../../common/enums/sort-order.enum';
import { HolidayType } from '../../../generated/prisma/enums';
import {
  DEFAULT_PUBLIC_HOLIDAY_SORT_FIELD,
  PUBLIC_HOLIDAY_SEARCH_MAX_LENGTH,
  PUBLIC_HOLIDAY_SORT_FIELDS,
} from '../public-holiday.constants';
import { PublicHolidayQueryDto } from './public-holiday-query.dto';

describe('PublicHolidayQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: PublicHolidayQueryDto,
  };

  const validate = (
    query: Record<string, string>,
  ): Promise<PublicHolidayQueryDto> =>
    pipe.transform(query, metadata) as Promise<PublicHolidayQueryDto>;

  it('defaults to the first page, ordered by name, unfiltered', async () => {
    await expect(validate({})).resolves.toEqual({
      page: FIRST_PAGE,
      limit: DEFAULT_PAGE_SIZE,
      sortBy: DEFAULT_PUBLIC_HOLIDAY_SORT_FIELD,
      sortOrder: SortOrder.ASC,
    });
  });

  it('inherits the pagination rules instead of redefining them', async () => {
    const query = await validate({ page: '2', limit: '50' });

    expect(query.page).toBe(2);
    expect(query.limit).toBe(50);
  });

  it('trims the search term', async () => {
    const query = await validate({ search: '  easter  ' });

    expect(query.search).toBe('easter');
  });

  it.each(PUBLIC_HOLIDAY_SORT_FIELDS)('sorts by %s', async (sortBy) => {
    const query = await validate({ sortBy });

    expect(query.sortBy).toBe(sortBy);
  });

  it.each(Object.values(HolidayType))(
    'filters by the type %s',
    async (type) => {
      const query = await validate({ type });

      expect(query.type).toBe(type);
    },
  );

  it('turns isNational=false into a real boolean, not into "absent"', async () => {
    const query = await validate({ isNational: 'false' });

    expect(query.isNational).toBe(false);
  });

  it('accepts the type and nationality filters together', async () => {
    const query = await validate({ type: 'FIXED', isNational: 'true' });

    expect(query.type).toBe('FIXED');
    expect(query.isNational).toBe(true);
  });

  it.each([
    ['a column that is not sortable', { sortBy: 'isNational' }],
    ['a column that does not exist', { sortBy: 'id; DROP TABLE' }],
    ['an unknown direction', { sortOrder: 'sideways' }],
    ['a type outside the enum', { type: 'MOVEABLE' }],
    ['the stored spelling of a type', { type: 'fixed' }],
    ['a boolean spelling that is not true or false', { isNational: '1' }],
    // Feature 019 replaced the column with a validity range: "is it still in
    // force" is a question about a year, and the calendar is what takes one.
    ['the removed isActive filter', { isActive: 'true' }],
    // Feature 018 removed `?year=`: the question it half-answered is now
    // `GET /public-holidays/calendar/:year`, and leaving the parameter in place
    // would be a second way to ask it.
    ['the removed year filter', { year: '2026' }],
    ['an unknown parameter', { month: '12' }],
  ])('rejects %s', async (_case, query) => {
    await expect(validate(query)).rejects.toThrow();
  });

  it('rejects a search term above the maximum length', async () => {
    await expect(
      validate({ search: 'a'.repeat(PUBLIC_HOLIDAY_SEARCH_MAX_LENGTH + 1) }),
    ).rejects.toThrow();
  });
});
