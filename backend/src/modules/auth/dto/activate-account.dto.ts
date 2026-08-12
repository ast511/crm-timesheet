import { IsPassword } from '../../../common/password/password.policy';
import { IsAccountToken } from './account-token.dto';

/**
 * Body of `POST /api/v1/auth/activate` — the last step of onboarding.
 *
 * The link from the invitation email, and the password its owner has chosen.
 * Nothing else: the account is named by the token rather than by an email field,
 * which is not a convenience but the security property. An `email` beside the
 * token would let a caller present a token for one account and an address for
 * another, and any endpoint that then had to reconcile the two would be one
 * mistake away from setting a password on the wrong one.
 *
 * There is no `confirmPassword`. Typing it twice is a *form* concern — it catches
 * a typo before the request is sent, which is exactly where it should be caught
 * — and an API that demanded both would be validating that a client had rendered
 * its form correctly.
 *
 * The password rule is `@IsPassword()`, shared with reset and change, so the
 * floor and the bcrypt ceiling are one decision made in one place. See
 * `common/password/password.policy.ts`.
 */
export class ActivateAccountDto {
  @IsAccountToken()
  readonly token!: string;

  @IsPassword()
  readonly password!: string;
}
