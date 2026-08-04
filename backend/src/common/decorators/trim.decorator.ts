import { Transform } from 'class-transformer';

/**
 * Strips surrounding whitespace from a string property before it is validated.
 *
 * Placed on the DTO rather than in a service so `"  Development  "` and
 * `"Development"` are the same value everywhere downstream — including in the
 * uniqueness checks, where a stray space would otherwise let a near-duplicate
 * through.
 *
 * An **array** is trimmed element by element, which is what makes the decorator
 * usable alongside a `{ each: true }` validator. Feature 023 is the first
 * property that needs it — `replacementEmployeeIds` is a list of foreign keys —
 * and without this an array would have fallen into the pass-through below and
 * reached the database with whatever whitespace a client's form left on it.
 *
 * Any other input is passed through untouched: rejecting it is the job of the
 * `@IsString()` that follows, which produces a far better message than a
 * transform throwing on `value.trim`.
 */
export function Trim() {
  return Transform(({ value }: { value: unknown }) => trimDeeply(value));
}

/** Trims a string, or every string in an array; anything else is left alone. */
function trimDeeply(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map((item: unknown) =>
      typeof item === 'string' ? item.trim() : item,
    );
  }

  return value;
}
