import { IsEmailAddress } from '../../../common/decorators/is-email-address.decorator';

/**
 * Body of `POST /api/v1/email/test`.
 *
 * One field, because one address is all the endpoint needs: everything else
 * about the message — subject, body, sender — is fixed, precisely so that what
 * is being tested is the SMTP configuration and not the caller's payload.
 *
 * `@IsEmailAddress()` is the shared decorator every address in this project
 * goes through: it trims, lower-cases and checks the value against the RFC 5321
 * length. The lower-casing does no work here — nothing is stored, nothing is
 * compared — but using the same decorator means "what this API accepts as an
 * address" stays one rule rather than two.
 *
 * `forbidNonWhitelisted` on the global pipe turns anything else in the body
 * into a 400, so an attempt to steer the message (a subject, an HTML body, a
 * `bcc`) is refused rather than silently dropped. This endpoint has no
 * authentication in front of it yet, which is exactly why it must not be
 * usable as a way to send arbitrary mail from the company's mail server.
 */
export class TestEmailDto {
  @IsEmailAddress()
  readonly email!: string;
}
