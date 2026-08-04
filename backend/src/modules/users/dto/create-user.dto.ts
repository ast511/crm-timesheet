import { IsBoolean, IsOptional } from 'class-validator';

import { IsEmailAddress } from '../../../common/decorators/is-email-address.decorator';
import { UserRole } from '../../../generated/prisma/enums';
import {
  IsUserPassword,
  IsUserRole,
  IsUserUsername,
} from './user-field.decorators';

/**
 * Body of `POST /api/v1/users`.
 *
 * `email` and `password` are the only required fields. `username` is optional
 * because the column is nullable; `isActive` is left to the schema's `true`
 * default rather than repeated here, so "a new account is enabled" stays one
 * decision made in one place.
 *
 * `role` is required rather than defaulted, even though the schema defaults it
 * to `USER`. An administrator creating an account is choosing what that account
 * may do, and a privilege level is the last field that should be decided by
 * omission.
 *
 * `password` is the plain-text secret and the only place it appears in this
 * module's types: the service hashes it and never persists or returns it.
 * `passwordHash` is not a property of this class, so the global pipe's
 * `forbidNonWhitelisted` turns an attempt to supply one into a `400`.
 */
export class CreateUserDto {
  @IsEmailAddress()
  readonly email!: string;

  @IsOptional()
  @IsUserUsername()
  readonly username?: string | null;

  @IsUserPassword()
  readonly password!: string;

  @IsUserRole()
  readonly role!: UserRole;

  @IsOptional()
  @IsBoolean()
  readonly isActive?: boolean;
}
