import { applyDecorators } from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

import { Trim } from '../../../common/decorators/trim.decorator';
import {
  MAX_PERMISSION_KEYS_PER_REQUEST,
  PERMISSION_KEY_MAX_LENGTH,
} from '../permission-management.constants';

/**
 * The per-field rules shared by this module's DTOs.
 *
 * The same split every module since Feature 007 uses: **constraints** live here,
 * **optionality** stays on the DTO, because `@IsOptional()` is what
 * distinguishes one endpoint's body from another's and has to be readable on the
 * class it applies to.
 *
 * The file is short because almost nothing in this module is written by a
 * client: the catalog and the presets are seeded vocabulary, so `label`, `name`
 * and `description` never arrive in a body. What does arrive is a *key* — and a
 * key is validated for shape here and for existence in the service, which is the
 * split `@IsRelationId()` already draws for a foreign key.
 */

/**
 * A permission or preset key as it arrives from a client — trimmed, non-empty,
 * bounded.
 *
 * **Shape only, and deliberately no `@Matches()`.** A `RESOURCE.ACTION` pattern
 * would be a second, drifting statement of what the seed writes: the day a
 * migration adds a resource whose name a regex did not anticipate, the API would
 * refuse a key the database holds. Whether a key names a real permission is a
 * question for the catalog, and `assertKnownPermissionKeys` asks it — reporting
 * a `400` that names the key, which is more useful than "does not match
 * pattern".
 *
 * It is deliberately **not** `@IsRelationId()`, although the two look alike.
 * That decorator bounds a cuid at `RELATION_ID_MAX_LENGTH`, a limit chosen for
 * generated ids; a key is a human-readable name from a different vocabulary with
 * a different bound, and sharing the constant would make one of the two move the
 * day the other needed to.
 */
export function IsPermissionKey() {
  return applyDecorators(
    Trim(),
    IsString(),
    IsNotEmpty(),
    MaxLength(PERMISSION_KEY_MAX_LENGTH),
  );
}

/**
 * `permissionKeys` — the full set of cells a `PUT` intends to leave ticked.
 *
 * Three rules, each doing something the others cannot:
 *
 * - **at most `MAX_PERMISSION_KEYS_PER_REQUEST`**, because every key costs a
 *   catalog lookup and a diff. There is deliberately **no minimum**: an empty
 *   array is a legitimate body — the intended set "nothing", which normalises to
 *   revoking everything the role grants — and is a different request from
 *   `DELETE`, which resets to the role. An `ArrayMinSize(1)` would make the two
 *   indistinguishable by making one of them impossible.
 * - **no duplicates**, checked here rather than left to the unique index on
 *   `(user_id, permission_id)`. The index would reject the write as a driver
 *   error surfacing as a `500`; this rejects the body as a `400` naming the
 *   field. Listing a permission twice does not grant it twice.
 * - **each a well-formed key**, via `@IsPermissionKey()` applied element by
 *   element. `@Trim()` handles arrays itself, so it is applied once inside.
 *
 * `{ each: true }` is spelled on the two array-element rules rather than passed
 * through, because `ArrayUnique` and `ArrayMaxSize` describe the *array* and
 * would be meaningless per element.
 */
export function IsPermissionKeys() {
  return applyDecorators(
    ArrayMaxSize(MAX_PERMISSION_KEYS_PER_REQUEST),
    ArrayUnique(),
    Trim(),
    IsString({ each: true }),
    IsNotEmpty({ each: true }),
    MaxLength(PERMISSION_KEY_MAX_LENGTH, { each: true }),
  );
}
