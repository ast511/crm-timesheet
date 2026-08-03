import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  DEFAULT_PAGE_SIZE,
  FIRST_PAGE,
} from '../../../common/constants/pagination.constants';
import { SortOrder } from '../../../common/enums/sort-order.enum';
import {
  EmployeeStatus,
  SeniorityLevel,
} from '../../../generated/prisma/enums';
import {
  DEFAULT_EMPLOYEE_SORT_FIELD,
  EMPLOYEE_SEARCH_MAX_LENGTH,
  EMPLOYEE_SORT_FIELDS,
} from '../employee.constants';
import { EmployeeQueryDto } from './employee-query.dto';

describe('EmployeeQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: EmployeeQueryDto,
  };

  const validate = (query: Record<string, string>): Promise<EmployeeQueryDto> =>
    pipe.transform(query, metadata) as Promise<EmployeeQueryDto>;

  it('defaults to the first page, ordered by employee code, unfiltered', async () => {
    await expect(validate({})).resolves.toEqual({
      page: FIRST_PAGE,
      limit: DEFAULT_PAGE_SIZE,
      sortBy: DEFAULT_EMPLOYEE_SORT_FIELD,
      sortOrder: SortOrder.ASC,
    });
  });

  it('inherits the pagination rules instead of redefining them', async () => {
    const query = await validate({ page: '2', limit: '50' });

    expect(query.page).toBe(2);
    expect(query.limit).toBe(50);
  });

  it('trims the search term', async () => {
    const query = await validate({ search: '  popescu  ' });

    expect(query.search).toBe('popescu');
  });

  it.each(EMPLOYEE_SORT_FIELDS)('sorts by %s', async (sortBy) => {
    const query = await validate({ sortBy });

    expect(query.sortBy).toBe(sortBy);
  });

  it('accepts both relation filters', async () => {
    const query = await validate({
      departmentId: 'dep-1',
      positionId: 'pos-1',
    });

    expect(query.departmentId).toBe('dep-1');
    expect(query.positionId).toBe('pos-1');
  });

  it.each(Object.values(SeniorityLevel))(
    'filters by the seniority %s',
    async (seniority) => {
      const query = await validate({ seniority });

      expect(query.seniority).toBe(seniority);
    },
  );

  it.each(Object.values(EmployeeStatus))(
    'filters by the status %s',
    async (status) => {
      const query = await validate({ status });

      expect(query.status).toBe(status);
    },
  );

  it('turns canReplaceOthers=true into a real boolean', async () => {
    const query = await validate({ canReplaceOthers: 'true' });

    expect(query.canReplaceOthers).toBe(true);
  });

  it('turns canReplaceOthers=false into a real boolean, not into "absent"', async () => {
    const query = await validate({ canReplaceOthers: 'false' });

    expect(query.canReplaceOthers).toBe(false);
  });

  it.each([
    ['a column that is not sortable', { sortBy: 'maxVacationDays' }],
    ['a related column', { sortBy: 'department' }],
    ['a column that does not exist', { sortBy: 'id; DROP TABLE' }],
    ['an unknown direction', { sortOrder: 'sideways' }],
    ['a seniority outside the enum', { seniority: 'PRINCIPAL' }],
    ['a lower-cased status', { status: 'active' }],
    ['a boolean spelling that is not true or false', { canReplaceOthers: '1' }],
    ['an unknown parameter', { firstName: 'Ion' }],
  ])('rejects %s', async (_case, query) => {
    await expect(validate(query)).rejects.toThrow();
  });

  it('rejects a search term above the maximum length', async () => {
    await expect(
      validate({ search: 'a'.repeat(EMPLOYEE_SEARCH_MAX_LENGTH + 1) }),
    ).rejects.toThrow();
  });
});
