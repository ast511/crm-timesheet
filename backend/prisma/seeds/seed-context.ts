import type { PrismaClient } from '../../src/generated/prisma/client';

/**
 * Shared vocabulary for every seed file.
 *
 * Individual seeds import the generated Prisma Client only through this
 * module, so the path to the generated directory is written once. Everything
 * here is infrastructure — no seed data lives in this file.
 */

/** The client handed to every seed. Seeds never construct their own. */
export type SeedClient = PrismaClient;

/**
 * Lookup returned by every seed: natural key (the entity's stable `code`) to
 * the persisted record.
 *
 * Later seeds need the database-generated `id` of earlier ones, and they only
 * know the natural key. Because `TKey` is a union of string literals rather
 * than `string`, referring to an entity that was never seeded is a compile
 * error instead of a runtime surprise.
 */
export type SeededRecords<TKey extends string, TRecord> = ReadonlyMap<
  TKey,
  TRecord
>;

/**
 * Upserts a list of seed items and indexes the results by their natural key.
 *
 * This is the idempotency mechanism shared by every seed: the caller supplies
 * an upsert keyed on a unique column, so a second run updates the row it
 * created on the first instead of inserting a duplicate.
 *
 * Deliberately sequential rather than `Promise.all`: the output order stays
 * stable and the seed never opens more connections than the pool expects.
 */
export async function upsertAll<TItem, TKey extends string, TRecord>(
  items: readonly TItem[],
  keyOf: (item: TItem) => TKey,
  upsert: (item: TItem) => Promise<TRecord>,
): Promise<SeededRecords<TKey, TRecord>> {
  const seeded = new Map<TKey, TRecord>();

  for (const item of items) {
    seeded.set(keyOf(item), await upsert(item));
  }

  return seeded;
}

/**
 * Resolves a previously seeded record, failing loudly when it is absent.
 *
 * `Map.get` is typed as possibly `undefined`, which every caller would
 * otherwise have to narrow by hand. A miss here can only mean the seeds ran
 * out of dependency order, so the message names that cause.
 */
export function requireSeeded<TKey extends string, TRecord>(
  seeded: SeededRecords<TKey, TRecord>,
  key: TKey,
  entity: string,
): TRecord {
  const record = seeded.get(key);

  if (record === undefined) {
    throw new Error(
      `No ${entity} was seeded for "${key}". Check the seed execution order in prisma/seed.ts.`,
    );
  }

  return record;
}

/**
 * Parses an ISO calendar date into a `Date` at UTC midnight.
 *
 * Seed dates are written as `YYYY-MM-DD` so they read as calendar dates, and
 * are parsed as UTC so the same seed produces the same timestamp on every
 * machine regardless of the local time zone.
 */
export function utcDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}
