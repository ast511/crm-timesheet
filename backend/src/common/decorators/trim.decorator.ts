import { Transform } from 'class-transformer';

/**
 * Strips surrounding whitespace from a string property before it is validated.
 *
 * Placed on the DTO rather than in a service so `"  Development  "` and
 * `"Development"` are the same value everywhere downstream — including in the
 * uniqueness checks, where a stray space would otherwise let a near-duplicate
 * through.
 *
 * Non-string input is passed through untouched: rejecting it is the job of the
 * `@IsString()` that follows, which produces a far better message than a
 * transform throwing on `value.trim`.
 */
export function Trim() {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}
