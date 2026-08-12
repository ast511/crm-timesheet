import { IsPassword } from '../../../common/password/password.policy';
import { IsAccountToken } from './account-token.dto';

/**
 * Body of `POST /api/v1/auth/reset-password`.
 *
 * The same two fields as `ActivateAccountDto` and deliberately a separate class
 * rather than a shared one, although the shapes are identical today. They are
 * two endpoints with two different meanings — "I am setting my first password"
 * and "I have forgotten the one I had" — reached from two different emails, and
 * a shared DTO would tie their request contracts together so that a field added
 * to one silently appeared on the other. The parts that genuinely must not drift
 * *are* shared: the token bound (`@IsAccountToken()`) and the password policy
 * (`@IsPassword()`).
 *
 * `newPassword` rather than `password`, matching `ChangePasswordDto`, because
 * this endpoint replaces something: the field name is what a client reads first,
 * and "new" is the word that says the old one is about to stop working.
 */
export class ResetPasswordDto {
  @IsAccountToken()
  readonly token!: string;

  @IsPassword()
  readonly newPassword!: string;
}
