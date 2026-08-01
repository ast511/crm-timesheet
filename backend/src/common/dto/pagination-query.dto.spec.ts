import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  DEFAULT_PAGE_SIZE,
  FIRST_PAGE,
  MAX_PAGE_SIZE,
} from '../constants/pagination.constants';
import { PaginationQueryDto } from './pagination-query.dto';

/**
 * Exercised through a `ValidationPipe` configured exactly like the global one
 * in `configureApp`, so what is asserted here is what a controller receives —
 * including the string-to-number coercion a real query string needs.
 */
describe('PaginationQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: PaginationQueryDto,
  };

  const validate = (query: Record<string, string>): Promise<unknown> =>
    pipe.transform(query, metadata) as Promise<unknown>;

  it('applies the defaults when nothing is provided', async () => {
    await expect(validate({})).resolves.toEqual({
      page: FIRST_PAGE,
      limit: DEFAULT_PAGE_SIZE,
    });
  });

  it('coerces the query string values to numbers', async () => {
    const query = (await validate({
      page: '3',
      limit: '50',
    })) as PaginationQueryDto;

    expect(query.page).toBe(3);
    expect(query.limit).toBe(50);
  });

  it('rejects a page below the first one', async () => {
    await expect(validate({ page: '0' })).rejects.toThrow();
  });

  it('rejects a page size above the cap', async () => {
    await expect(
      validate({ limit: String(MAX_PAGE_SIZE + 1) }),
    ).rejects.toThrow();
  });

  it('accepts the cap itself', async () => {
    const query = (await validate({
      limit: String(MAX_PAGE_SIZE),
    })) as PaginationQueryDto;

    expect(query.limit).toBe(MAX_PAGE_SIZE);
  });

  it('rejects a non-numeric value instead of falling back to the default', async () => {
    await expect(validate({ page: 'abc' })).rejects.toThrow();
  });

  it('rejects a fractional page size', async () => {
    await expect(validate({ limit: '10.5' })).rejects.toThrow();
  });
});
