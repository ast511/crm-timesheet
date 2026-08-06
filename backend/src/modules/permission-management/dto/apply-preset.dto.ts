import { IsPermissionKey } from './permission-management-field.decorators';

/**
 * Body of `POST /api/v1/users/:id/permissions/apply-preset`.
 *
 * One field, and that is the whole design: applying a preset is choosing a card,
 * not composing a request. There is no `merge` flag and no list of exceptions to
 * apply alongside it — a preset **replaces** the user's overrides so their
 * effective set equals the preset, and an administrator who then wants one cell
 * different sends a `PUT`. A merge option would make "what does this preset give
 * somebody" a question with two answers depending on what they held before.
 *
 * The preset is named by `presetKey` rather than by `presetId`, for the reason
 * `SetUserPermissionsDto` takes permission keys: `HR_FULL_ACCESS` is what the
 * seed writes, what the feature document quotes and what a request log will show
 * a year from now, while a cuid is a value a client would have to fetch the
 * preset list to learn. An unknown key is a `404` naming it — the preset is a
 * resource the body addresses, so its absence is an absent resource rather than
 * a malformed body.
 */
export class ApplyPresetDto {
  /** `HR_FULL_ACCESS` — the preset's stable key. A `404` if no preset has it. */
  @IsPermissionKey()
  readonly presetKey!: string;
}
