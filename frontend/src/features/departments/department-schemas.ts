import { z } from 'zod';

/**
 * What the department form accepts, mirroring the backend's DTOs.
 *
 * ## The rules are borrowed, never invented
 *
 * Every bound below is the backend's own, from `department.constants.ts` and the
 * `@IsDepartment*()` decorators in `dto/department-field.decorators.ts`:
 *
 * | Field | Rule | Backend constant |
 * | --- | --- | --- |
 * | `code` | required, ≤ 20, `A-Z0-9` with `-`/`_` separators, upper-cased | `DEPARTMENT_CODE_MAX_LENGTH`, `DEPARTMENT_CODE_PATTERN` |
 * | `name` | required, ≤ 100, trimmed | `DEPARTMENT_NAME_MAX_LENGTH` |
 * | `description` | optional, ≤ 500, blank becomes `null` | `DEPARTMENT_DESCRIPTION_MAX_LENGTH` |
 * | `isActive` | boolean | schema default `true` |
 *
 * A browser rule **stricter** than the server's would refuse a value the API
 * would have accepted, which is the one direction a UX check must never err in.
 * This is validation for immediate feedback; the backend stays the authority,
 * and its `VALIDATION_ERROR` is still mapped back onto these fields.
 *
 * ## Two deliberate matches with the DTO's `@Transform`s
 *
 * - **`code` is upper-cased before the pattern runs**, exactly as
 *   `IsDepartmentCode()` does — so `dev` is accepted and stored as `DEV` rather
 *   than refused for a rule the backend does not apply. The upper-casing is
 *   normalisation, not cosmetics: PostgreSQL's unique index is case-sensitive,
 *   and folding the case at the edge is what makes it a real guarantee.
 * - **A blank `description` becomes `null`**, as `IsDepartmentDescription()`
 *   does. A cleared textarea posts `''`, which is not a shorter description but
 *   the absence of one; storing it verbatim would give the column two values
 *   meaning "empty" and force every reader to check for both. An `<input>`
 *   cannot express `null`, so the conversion happens once, here, and the form
 *   component never has to remember it.
 */

export const DEPARTMENT_CODE_MAX_LENGTH = 20;
export const DEPARTMENT_CODE_PATTERN = /^[A-Z0-9]+([-_][A-Z0-9]+)*$/;
export const DEPARTMENT_NAME_MAX_LENGTH = 100;
export const DEPARTMENT_DESCRIPTION_MAX_LENGTH = 500;

/** Every sentence the schema can produce, already translated. */
export interface DepartmentValidationMessages {
  codeRequired: string;
  codeTooLong: string;
  codeInvalid: string;
  nameRequired: string;
  nameTooLong: string;
  descriptionTooLong: string;
}

export const createDepartmentSchema = (messages: DepartmentValidationMessages) =>
  z.object({
    code: z
      .string()
      .trim()
      .min(1, messages.codeRequired)
      .max(DEPARTMENT_CODE_MAX_LENGTH, messages.codeTooLong)
      .transform((value) => value.toUpperCase())
      .refine((value) => DEPARTMENT_CODE_PATTERN.test(value), messages.codeInvalid),

    name: z
      .string()
      .trim()
      .min(1, messages.nameRequired)
      .max(DEPARTMENT_NAME_MAX_LENGTH, messages.nameTooLong),

    description: z
      .string()
      .trim()
      .max(DEPARTMENT_DESCRIPTION_MAX_LENGTH, messages.descriptionTooLong)
      .transform((value): string | null => (value === '' ? null : value)),

    isActive: z.boolean(),
  });

export type DepartmentSchema = ReturnType<typeof createDepartmentSchema>;

/** What the inputs hold — strings, before the transforms run. */
export type DepartmentFormInput = z.input<DepartmentSchema>;

/** What a valid submit produces — exactly the shape `POST`/`PATCH` accept. */
export type DepartmentFormValues = z.output<DepartmentSchema>;
