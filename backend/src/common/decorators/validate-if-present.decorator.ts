import { ValidateIf } from 'class-validator';

/**
 * Marks a field as optional *without* also making `null` acceptable.
 *
 * `@IsOptional()` skips every constraint when the value is `undefined` **or**
 * `null`. For a nullable column that is exactly right — `phone: null` is how a
 * phone number is removed, and the checks should not run on it. For a required
 * column it is a hole: `null` is not a value the column can hold, but the
 * constraints are skipped, so it travels through the DTO untouched and reaches
 * Prisma, which rejects it as a driver error — a `500` where the client
 * deserved a `400` naming the field.
 *
 * This runs the constraints on anything that was actually sent, `null`
 * included, and skips them only for a field the body omitted:
 *
 * ```ts
 * @ValidateIfPresent()
 * @IsRelationId()
 * readonly departmentId?: string;   // omitted: kept. null: 400.
 *
 * @IsOptional()
 * @IsEmployeePhone()
 * readonly phone?: string | null;   // omitted: kept. null: cleared.
 * ```
 *
 * It lives beside `@Trim()` and `@ToBoolean()` because it is the same kind of
 * thing: a transport concern with nothing resource-specific in it, which every
 * `PATCH` DTO over a required column needs.
 */
export function ValidateIfPresent() {
  return ValidateIf((_object: unknown, value: unknown) => value !== undefined);
}
