import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  DEFAULT_PAGE_SIZE,
  FIRST_PAGE,
} from '../../../common/constants/pagination.constants';
import { SortOrder } from '../../../common/enums/sort-order.enum';
import {
  DEFAULT_PROJECT_MEMBER_SORT_FIELD,
  PROJECT_MEMBER_SORT_FIELDS,
} from '../project-member.constants';
import { ProjectMemberQueryDto } from './project-member-query.dto';

describe('ProjectMemberQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: ProjectMemberQueryDto,
  };

  const validate = (
    query: Record<string, string>,
  ): Promise<ProjectMemberQueryDto> =>
    pipe.transform(query, metadata) as Promise<ProjectMemberQueryDto>;

  it('defaults to the first page, ordered by joinedAt, unfiltered', async () => {
    await expect(validate({})).resolves.toEqual({
      page: FIRST_PAGE,
      limit: DEFAULT_PAGE_SIZE,
      sortBy: DEFAULT_PROJECT_MEMBER_SORT_FIELD,
      sortOrder: SortOrder.ASC,
    });
  });

  it('inherits the pagination rules instead of redefining them', async () => {
    const query = await validate({ page: '2', limit: '50' });

    expect(query.page).toBe(2);
    expect(query.limit).toBe(50);
  });

  it.each(PROJECT_MEMBER_SORT_FIELDS)('sorts by %s', async (sortBy) => {
    const query = await validate({ sortBy });

    expect(query.sortBy).toBe(sortBy);
  });

  it('rejects a column that is not sortable', async () => {
    await expect(validate({ sortBy: 'isProjectManager' })).rejects.toThrow();
  });

  it.each(['projectId', 'employeeId'])(
    'rejects %s — Feature 015 replaced that filter with a scoped URL',
    async (field) => {
      await expect(validate({ [field]: 'x-1' })).rejects.toThrow();
    },
  );

  it('turns activeOnly=true into a real boolean', async () => {
    const query = await validate({ activeOnly: 'true' });

    expect(query.activeOnly).toBe(true);
  });

  it('turns isProjectManager=false into a real boolean, not into "absent"', async () => {
    const query = await validate({ isProjectManager: 'false' });

    expect(query.isProjectManager).toBe(false);
  });

  it.each(['yes', '1', 'TRUE'])(
    'rejects %s rather than guessing at it',
    async (activeOnly) => {
      await expect(validate({ activeOnly })).rejects.toThrow();
    },
  );

  it('combines the two filters', async () => {
    const query = await validate({
      isProjectManager: 'true',
      activeOnly: 'true',
    });

    expect(query.isProjectManager).toBe(true);
    expect(query.activeOnly).toBe(true);
  });

  it('rejects an unknown parameter rather than ignoring it', async () => {
    await expect(validate({ search: 'popescu' })).rejects.toThrow();
  });
});
