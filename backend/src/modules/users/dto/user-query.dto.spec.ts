import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  DEFAULT_PAGE_SIZE,
  FIRST_PAGE,
} from '../../../common/constants/pagination.constants';
import { SortOrder } from '../../../common/enums/sort-order.enum';
import { UserRole } from '../../../generated/prisma/enums';
import {
  DEFAULT_USER_SORT_FIELD,
  USER_SEARCH_MAX_LENGTH,
} from '../user.constants';
import { UserQueryDto } from './user-query.dto';

describe('UserQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: UserQueryDto,
  };

  const validate = (query: Record<string, string>): Promise<UserQueryDto> =>
    pipe.transform(query, metadata) as Promise<UserQueryDto>;

  it('defaults to the first page, ordered by email ascending, unfiltered', async () => {
    await expect(validate({})).resolves.toEqual({
      page: FIRST_PAGE,
      limit: DEFAULT_PAGE_SIZE,
      sortBy: DEFAULT_USER_SORT_FIELD,
      sortOrder: SortOrder.ASC,
    });
  });

  it('inherits the pagination rules instead of redefining them', async () => {
    const query = await validate({ page: '2', limit: '50' });

    expect(query.page).toBe(2);
    expect(query.limit).toBe(50);
  });

  it('trims the search term', async () => {
    const query = await validate({ search: '  ana  ' });

    expect(query.search).toBe('ana');
  });

  it.each(['email', 'username', 'role', 'createdAt'])(
    'sorts by %s',
    async (sortBy) => {
      const query = await validate({ sortBy });

      expect(query.sortBy).toBe(sortBy);
    },
  );

  it.each(Object.values(UserRole))('filters by the role %s', async (role) => {
    const query = await validate({ role });

    expect(query.role).toBe(role);
  });

  it('turns isActive=true into a real boolean', async () => {
    const query = await validate({ isActive: 'true' });

    expect(query.isActive).toBe(true);
  });

  it('turns isActive=false into a real boolean, not into "absent"', async () => {
    const query = await validate({ isActive: 'false' });

    expect(query.isActive).toBe(false);
  });

  it.each([
    ['a column that is not sortable', { sortBy: 'passwordHash' }],
    ['a column that does not exist', { sortBy: 'id; DROP TABLE' }],
    ['an unknown direction', { sortOrder: 'sideways' }],
    ['a role outside the enum', { role: 'ROOT' }],
    ['a lower-cased role', { role: 'admin' }],
    ['a boolean spelling that is not true or false', { isActive: 'yes' }],
    ['an unknown parameter', { email: 'ana@example.com' }],
  ])('rejects %s', async (_case, query) => {
    await expect(validate(query)).rejects.toThrow();
  });

  it('rejects a search term above the maximum length', async () => {
    await expect(
      validate({ search: 'a'.repeat(USER_SEARCH_MAX_LENGTH + 1) }),
    ).rejects.toThrow();
  });
});
