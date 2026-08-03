import { IsBoolean, IsOptional } from 'class-validator';

import { UserRole } from '../../../generated/prisma/enums';
import {
  IsUserPassword,
  IsUserRole,
  IsUserUsername,
} from './user-field.decorators';

/**
 * Body of `PATCH /api/v1/users/:id`.
 *
 * Every field is optional, and an absent one means "leave it alone" — Prisma
 * omits `undefined` from the `UPDATE`, so a partial body never blanks a column
 * the client did not mention. `username: null` (or `""`) is the explicit way to
 * remove a username, which is a different request from omitting it.
 *
 * **`email` is absent on purpose.** It is the account's identity, and changing
 * it is not a field edit but a flow: the new address has to be proven reachable
 * before the old one stops working, or an administrator's typo locks a person
 * out of an account they can no longer be contacted about. That flow belongs
 * with email verification, which this feature explicitly does not implement.
 * Being absent from the class, `email` is rejected with a `400` rather than
 * silently ignored.
 *
 * `password` is accepted here and re-hashed by the service. It is an
 * administrative reset, not a self-service password change: no current password
 * is asked for, because there is nobody to ask yet — authentication arrives in
 * a later feature, and with it the endpoint that should require one.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsUserUsername()
  readonly username?: string | null;

  @IsOptional()
  @IsUserPassword()
  readonly password?: string;

  @IsOptional()
  @IsUserRole()
  readonly role?: UserRole;

  @IsOptional()
  @IsBoolean()
  readonly isActive?: boolean;
}
