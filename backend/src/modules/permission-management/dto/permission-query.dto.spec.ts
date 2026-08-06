import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  DEFAULT_PAGE_SIZE,
  FIRST_PAGE,
  MAX_PAGE_SIZE,
} from '../../../common/constants/pagination.constants';
import { SortOrder } from '../../../common/enums/sort-order.enum';
import {
  PermissionAction,
  PermissionResource,
} from '../../../generated/prisma/enums';
import {
  DEFAULT_PERMISSION_SORT_FIELD,
  PERMISSION_SEARCH_MAX_LENGTH,
  PERMISSION_SORT_FIELDS,
} from '../permission-management.constants';
import { PermissionQueryDto } from './permission-query.dto';

describe('PermissionQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: PermissionQueryDto,
  };

  const validate = (
    query: Record<string, string>,
  ): Promise<PermissionQueryDto> =>
    pipe.transform(query, metadata) as Promise<PermissionQueryDto>;

  it('defaults to the first page, in matrix order, unfiltered', async () => {
    await expect(validate({})).resolves.toEqual({
      page: FIRST_PAGE,
      limit: DEFAULT_PAGE_SIZE,
      sortBy: DEFAULT_PERMISSION_SORT_FIELD,
      sortOrder: SortOrder.ASC,
    });
  });

  it('defaults to resource rather than the project-wide createdAt', async () => {
    // A catalog is a matrix, and the only order that means anything is the one
    // it is drawn in. Sorting it by creation time would order it by the order
    // somebody happened to write the seed.
    const query = await validate({});

    expect(query.sortBy).toBe('resource');
  });

  describe('inherited pagination', () => {
    it('coerces the numbers a query string carries as text', async () => {
      await expect(
        validate({ page: '2', limit: '100' }),
      ).resolves.toMatchObject({ page: 2, limit: 100 });
    });

    it('accepts the cap, which is what fetches the whole catalog at once', async () => {
      await expect(
        validate({ limit: String(MAX_PAGE_SIZE) }),
      ).resolves.toMatchObject({ limit: MAX_PAGE_SIZE });
    });

    it('rejects a limit past the cap rather than clamping it', async () => {
      await expect(
        validate({ limit: String(MAX_PAGE_SIZE + 1) }),
      ).rejects.toThrow();
    });
  });

  describe('search', () => {
    it('trims', async () => {
      await expect(validate({ search: '  approve  ' })).resolves.toMatchObject({
        search: 'approve',
      });
    });

    it('accepts the bound', async () => {
      await expect(
        validate({ search: 'a'.repeat(PERMISSION_SEARCH_MAX_LENGTH) }),
      ).resolves.toMatchObject({
        search: 'a'.repeat(PERMISSION_SEARCH_MAX_LENGTH),
      });
    });

    it('rejects a term past the bound', async () => {
      await expect(
        validate({ search: 'a'.repeat(PERMISSION_SEARCH_MAX_LENGTH + 1) }),
      ).rejects.toThrow();
    });
  });

  describe('filters', () => {
    it('accepts a resource and an action together', async () => {
      await expect(
        validate({
          resource: PermissionResource.TIMESHEET,
          action: PermissionAction.CREATE,
        }),
      ).resolves.toMatchObject({
        resource: PermissionResource.TIMESHEET,
        action: PermissionAction.CREATE,
      });
    });

    it('rejects a resource the schema does not know', async () => {
      await expect(validate({ resource: 'PAYROLL' })).rejects.toThrow();
    });

    it('rejects an action the schema does not know', async () => {
      await expect(validate({ action: 'EXPORT' })).rejects.toThrow();
    });
  });

  describe('sortBy', () => {
    it.each(PERMISSION_SORT_FIELDS)('accepts %s', async (field) => {
      await expect(validate({ sortBy: field })).resolves.toMatchObject({
        sortBy: field,
      });
    });

    it('rejects anything that is not enumerated, so nothing reaches orderBy', async () => {
      await expect(validate({ sortBy: 'key; DROP TABLE' })).rejects.toThrow();
    });

    it('rejects label, which would interleave the twelve resources', async () => {
      await expect(validate({ sortBy: 'label' })).rejects.toThrow();
    });
  });

  it('rejects a parameter this endpoint does not offer', async () => {
    // There is no ?role= and no ?userId=: "what does HR get" and "what does this
    // person hold" are the resolution, and it has its own endpoints.
    await expect(validate({ role: 'HR' })).rejects.toThrow();
  });
});
