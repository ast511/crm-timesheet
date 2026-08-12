import { IsEmailAddress } from '../../../common/decorators/is-email-address.decorator';

/**
 * Body of `POST /api/v1/auth/forgot-password`.
 *
 * One field, and the endpoint's whole design is about what it does *not* tell
 * the caller back. The address is validated for shape and folded by
 * `@IsEmailAddress()` — the same transform login applies, which matters here for
 * the same reason it matters to the rate limiter: `Ana@company.com` and
 * `ana@company.com` must reach the same account, or the endpoint would behave
 * differently depending on how somebody capitalised their own address.
 *
 * A malformed address is still a `400`, and that is not an enumeration leak: it
 * says the string is not an email address, which the caller could have worked
 * out themselves, and says nothing about whether any account exists. What is
 * never distinguished is a *well-formed* address that names an account from one
 * that does not — see `PASSWORD_RESET_REQUESTED_MESSAGE`.
 */
export class ForgotPasswordDto {
  @IsEmailAddress()
  readonly email!: string;
}
