import { Transform } from 'class-transformer';

/**
 * Turns the query-string spellings of a boolean into a real `boolean`.
 *
 * Query parameters are always text, so `?isActive=true` arrives as the string
 * `"true"` and an `@IsBoolean()` on its own would reject every request. This is
 * the query-string counterpart of the `@Type(() => Number)` that
 * `PaginationQueryDto` puts on `page` and `limit`, and it lives beside `@Trim()`
 * for the same reason: it is a transport concern, identical for every resource
 * that ever exposes a boolean filter.
 *
 * Only the two exact spellings are converted. Anything else — `"yes"`, `"1"`,
 * `"TRUE"` — is passed through untouched so the `@IsBoolean()` that follows
 * rejects it with a message naming the field, rather than being quietly
 * coerced into a filter the caller did not ask for.
 */
export function ToBoolean() {
  return Transform(({ value }: { value: unknown }) => {
    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    return value;
  });
}
