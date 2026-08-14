import { useEffect, useState } from 'react';

/**
 * Returns `value` after it has stopped changing for `delayMs`.
 *
 * Used by the `DataTable` search box: the input stays immediate while the
 * *query* only changes once typing pauses, so a nine-letter search is one
 * request instead of nine.
 */
export const useDebouncedValue = <TValue,>(value: TValue, delayMs: number): TValue => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);

    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
};
