import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  DEFAULT_PAGE_SIZE,
  FIRST_PAGE,
} from '../../../common/constants/pagination.constants';
import { SortOrder } from '../../../common/enums/sort-order.enum';
import {
  ProjectPriority,
  ProjectStatus,
} from '../../../generated/prisma/enums';
import {
  DEFAULT_PROJECT_SORT_FIELD,
  PROJECT_SEARCH_MAX_LENGTH,
  PROJECT_SORT_FIELDS,
} from '../project.constants';
import { ProjectQueryDto } from './project-query.dto';

describe('ProjectQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: ProjectQueryDto,
  };

  const validate = (query: Record<string, string>): Promise<ProjectQueryDto> =>
    pipe.transform(query, metadata) as Promise<ProjectQueryDto>;

  it('defaults to the first page, ordered by code, unfiltered', async () => {
    await expect(validate({})).resolves.toEqual({
      page: FIRST_PAGE,
      limit: DEFAULT_PAGE_SIZE,
      sortBy: DEFAULT_PROJECT_SORT_FIELD,
      sortOrder: SortOrder.ASC,
    });
  });

  it('inherits the pagination rules instead of redefining them', async () => {
    const query = await validate({ page: '2', limit: '50' });

    expect(query.page).toBe(2);
    expect(query.limit).toBe(50);
  });

  it('trims the search term', async () => {
    const query = await validate({ search: '  portal  ' });

    expect(query.search).toBe('portal');
  });

  it.each(PROJECT_SORT_FIELDS)('sorts by %s', async (sortBy) => {
    const query = await validate({ sortBy });

    expect(query.sortBy).toBe(sortBy);
  });

  it('turns isArchived=false into a real boolean, not into "absent"', async () => {
    const query = await validate({ isArchived: 'false' });

    expect(query.isArchived).toBe(false);
  });

  it('accepts the archived flag alongside a status filter', async () => {
    const query = await validate({
      isArchived: 'false',
      projectStatus: 'ACTIVE',
    });

    expect(query.isArchived).toBe(false);
    expect(query.projectStatus).toBe('ACTIVE');
  });

  it.each(Object.values(ProjectStatus))(
    'filters by the status %s',
    async (projectStatus) => {
      const query = await validate({ projectStatus });

      expect(query.projectStatus).toBe(projectStatus);
    },
  );

  it.each(Object.values(ProjectPriority))(
    'filters by the priority %s',
    async (projectPriority) => {
      const query = await validate({ projectPriority });

      expect(query.projectPriority).toBe(projectPriority);
    },
  );

  it.each([
    ['a column that is not sortable', { sortBy: 'color' }],
    ['a column that does not exist', { sortBy: 'id; DROP TABLE' }],
    ['an unknown direction', { sortOrder: 'sideways' }],
    ['a status outside the enum', { projectStatus: 'PAUSED' }],
    ['the stored spelling of a status', { projectStatus: 'on_hold' }],
    ['a lower-cased priority', { projectPriority: 'high' }],
    ['a boolean spelling that is not true or false', { isArchived: '1' }],
    ['the removed isActive filter', { isActive: 'true' }],
    ['an unknown parameter', { clientName: 'Internal' }],
  ])('rejects %s', async (_case, query) => {
    await expect(validate(query)).rejects.toThrow();
  });

  it('rejects a search term above the maximum length', async () => {
    await expect(
      validate({ search: 'a'.repeat(PROJECT_SEARCH_MAX_LENGTH + 1) }),
    ).rejects.toThrow();
  });
});
