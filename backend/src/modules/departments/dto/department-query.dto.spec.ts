import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  DEFAULT_PAGE_SIZE,
  FIRST_PAGE,
} from '../../../common/constants/pagination.constants';
import { SortOrder } from '../../../common/enums/sort-order.enum';
import {
  DEFAULT_DEPARTMENT_SORT_FIELD,
  DEPARTMENT_SEARCH_MAX_LENGTH,
} from '../department.constants';
import { DepartmentQueryDto } from './department-query.dto';

describe('DepartmentQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: DepartmentQueryDto,
  };

  const validate = (
    query: Record<string, string>,
  ): Promise<DepartmentQueryDto> =>
    pipe.transform(query, metadata) as Promise<DepartmentQueryDto>;

  it('defaults to the first page, ordered by name ascending', async () => {
    await expect(validate({})).resolves.toEqual({
      page: FIRST_PAGE,
      limit: DEFAULT_PAGE_SIZE,
      sortBy: DEFAULT_DEPARTMENT_SORT_FIELD,
      sortOrder: SortOrder.ASC,
    });
  });

  it('inherits the pagination rules instead of redefining them', async () => {
    const query = await validate({ page: '2', limit: '50' });

    expect(query.page).toBe(2);
    expect(query.limit).toBe(50);
  });

  it('trims the search term', async () => {
    const query = await validate({ search: '  dev  ' });

    expect(query.search).toBe('dev');
  });

  it.each(['code', 'name', 'createdAt'])('sorts by %s', async (sortBy) => {
    const query = await validate({ sortBy });

    expect(query.sortBy).toBe(sortBy);
  });

  it.each(['asc', 'desc'])('accepts %s as a direction', async (sortOrder) => {
    const query = await validate({ sortOrder });

    expect(query.sortOrder).toBe(sortOrder);
  });

  it.each([
    ['a column that is not sortable', { sortBy: 'description' }],
    ['a column that does not exist', { sortBy: 'id; DROP TABLE' }],
    ['an unknown direction', { sortOrder: 'sideways' }],
    ['an unknown parameter', { isActive: 'true' }],
  ])('rejects %s', async (_case, query) => {
    await expect(validate(query)).rejects.toThrow();
  });

  it('rejects a search term above the maximum length', async () => {
    await expect(
      validate({ search: 'a'.repeat(DEPARTMENT_SEARCH_MAX_LENGTH + 1) }),
    ).rejects.toThrow();
  });
});
