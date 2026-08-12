import { IsOptional } from 'class-validator';

import { IsEmailAddress } from '../../../common/decorators/is-email-address.decorator';
import { UserRole } from '../../../generated/prisma/enums';
import { IsUserRole, IsUserUsername } from './user-field.decorators';

/**
 * Body of `POST /api/v1/users` — an administrator creating a login.
 *
 * ## There is no `password`, and that is the feature
 *
 * Feature 036 removed it. An administrator no longer chooses somebody else's
 * password, because a password an administrator chooses is a password an
 * administrator *knows* — and in practice also one that lives on in a chat
 * message, is never changed, and is the same three words for everybody they
 * onboarded that month. The account is created in `PENDING_ACTIVATION` with no
 * password at all, and the person it belongs to sets their own through the
 * activation link emailed to them. Nothing in this API ever transmits a password
 * to anybody.
 *
 * Being absent from the class, `password` is rejected with a `400` naming it
 * rather than silently ignored — the global pipe's `forbidNonWhitelisted` — so a
 * client written against the old contract is told plainly rather than creating an
 * account whose password it thinks it set.
 *
 * ## There is no `isActive` either
 *
 * It went with the column. A new account's state is not something the creator
 * chooses: it is `PENDING_ACTIVATION` because nobody has set a password yet, and
 * it becomes `ACTIVE` when its owner does. Creating an account that is disabled
 * before it exists is not a thing anybody needs; disabling one afterwards is
 * `POST /users/:id/deactivate`.
 *
 * `email` is required and is where the invitation is sent, so it is the one field
 * a typo in is expensive — the link goes to a mailbox nobody reads, and the fix
 * is to delete the account and create it again, since `email` is not patchable.
 *
 * `role` is required rather than defaulted, even though the schema defaults it to
 * `USER`. An administrator creating an account is choosing what that account may
 * do, and a privilege level is the last field that should be decided by omission.
 */
export class CreateUserDto {
  @IsEmailAddress()
  readonly email!: string;

  @IsOptional()
  @IsUserUsername()
  readonly username?: string | null;

  @IsUserRole()
  readonly role!: UserRole;
}
