import { applyDecorators } from '@nestjs/common';
import { IsString, Length } from 'class-validator';

import { ACCOUNT_TOKEN_BYTES } from '../auth.constants';

/**
 * The link secret, as it arrives in a body.
 *
 * Shared by `POST /auth/activate` and `POST /auth/reset-password`, because it is
 * the same credential in the same shape — the one-mechanism-two-purposes rule
 * expressed at the DTO layer as well as in the table. A second copy would be a
 * second bound, and the day they differed one endpoint would accept a length the
 * other refused.
 *
 * ## Why it is in the body and not the query string
 *
 * The frontend receives it as `?token=…` in the emailed URL and posts it. That
 * hop is deliberate: a query string is written into web-server access logs,
 * `Referer` headers and browser history, and a credential that sets a password
 * should be in none of the three. The page reads it from its own URL — which is
 * unavoidable, since the link has to carry it somehow — and sends it onward in a
 * body that nothing logs.
 *
 * ## The bound
 *
 * Exactly the length {@link ACCOUNT_TOKEN_BYTES} bytes of base64url produce, on
 * the nose rather than as a range. Everything this API issues is that length, so
 * anything else is not a token of ours and can be refused before a hash is
 * computed or a row is read — which is what keeps an unauthenticated endpoint
 * from being somewhere to push a megabyte into a digest.
 *
 * Shape only. Whether the token is real, unexpired and unused is the database's
 * answer, and it is not asked until the string is plausibly one of ours.
 */
export function IsAccountToken() {
  return applyDecorators(
    IsString(),
    Length(ACCOUNT_TOKEN_LENGTH, ACCOUNT_TOKEN_LENGTH),
  );
}

/**
 * Characters of base64url for {@link ACCOUNT_TOKEN_BYTES} bytes.
 *
 * Derived rather than written as `43`, so changing the byte count changes the
 * bound with it. base64 encodes three bytes as four characters, and base64url as
 * Node produces it carries no `=` padding — hence the ceiling with no rounding
 * term after it.
 */
const ACCOUNT_TOKEN_LENGTH = Math.ceil((ACCOUNT_TOKEN_BYTES * 4) / 3);
