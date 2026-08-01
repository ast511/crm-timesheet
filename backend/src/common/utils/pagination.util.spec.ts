import { buildPaginatedResult, toSkipTake } from './pagination.util';

describe('toSkipTake', () => {
  it('skips nothing on the first page', () => {
    expect(toSkipTake({ page: 1, limit: 20 })).toEqual({ skip: 0, take: 20 });
  });

  it('skips the pages that come before the requested one', () => {
    expect(toSkipTake({ page: 3, limit: 20 })).toEqual({ skip: 40, take: 20 });
  });
});

describe('buildPaginatedResult', () => {
  const items = ['a', 'b'];

  it('reports the position of a middle page', () => {
    const { meta } = buildPaginatedResult(items, 50, { page: 2, limit: 20 });

    expect(meta).toEqual({
      page: 2,
      limit: 20,
      total: 50,
      totalPages: 3,
      hasPreviousPage: true,
      hasNextPage: true,
    });
  });

  it('returns the items untouched', () => {
    expect(buildPaginatedResult(items, 2, { page: 1, limit: 20 }).items).toBe(
      items,
    );
  });

  it('counts a partially filled last page', () => {
    const { meta } = buildPaginatedResult(items, 41, { page: 3, limit: 20 });

    expect(meta.totalPages).toBe(3);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(true);
  });

  it('reports no pages at all when nothing matched', () => {
    const { meta } = buildPaginatedResult([], 0, { page: 1, limit: 20 });

    expect(meta.totalPages).toBe(0);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(false);
  });
});
