/**
 * The auth module's literals and bounds, in one place.
 *
 * Two of them are wire format — the header a token arrives in and the scheme it
 * is prefixed with — and the rest are the limits that keep an unauthenticated
 * endpoint from being a place to send a megabyte to.
 */

/** Where an access token arrives. Lower-case: Node normalises header names. */
export const AUTHORIZATION_HEADER = 'authorization';

/**
 * The scheme `Authorization` carries, per RFC 6750.
 *
 * Matched case-insensitively when reading — clients disagree about `Bearer` and
 * `bearer`, and RFC 7235 makes the scheme a case-insensitive token — but written
 * exactly like this in every response, so a client that echoes what it was given
 * sends something valid.
 */
export const BEARER_SCHEME = 'Bearer';

/**
 * The `typ` claim distinguishing the two kinds of token.
 *
 * The secrets already differ, so a refresh token cannot verify against the
 * access key at all. This is the second lock on the same door, and it is worth
 * its two lines because the failure it prevents is silent: the day somebody
 * copies one secret into both variables — in a `.env`, in a Kubernetes secret,
 * in a CI matrix — the signature check stops telling the two apart, and a
 * long-lived refresh token becomes usable directly against every protected
 * route. `env.validation.ts` refuses that configuration at startup; this refuses
 * the token even if it were ever reached.
 */
export const ACCESS_TOKEN_TYPE = 'access';

export const REFRESH_TOKEN_TYPE = 'refresh';

/**
 * What a failed login says, whichever half of the credentials was wrong.
 *
 * One message, one status, for an unknown address and for a wrong password
 * alike. Distinguishing them would turn `POST /auth/login` into an oracle for
 * "does this person have an account here" — which, for a company's internal
 * system, is also "does this person work here", and it is answerable at whatever
 * rate somebody can send requests. `AuthService` equalises the *timing* of the
 * two paths for the same reason; see the decoy hash there.
 */
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

/**
 * What every rejected access token says.
 *
 * Deliberately as uninformative as the login message and for a related reason:
 * "expired" and "malformed" are useful to a client, but "this token is valid,
 * the account is deactivated" is a fact about somebody's employment that an
 * unauthenticated caller holding a stale token should not be told. One message
 * for all of them keeps that distinction out of the response, and the client
 * behaviour is identical anyway — refresh, then log in.
 */
export const INVALID_ACCESS_TOKEN_MESSAGE = 'Invalid or expired access token';

/** What every rejected refresh presents, for the same reason as above. */
export const INVALID_REFRESH_TOKEN_MESSAGE = 'Invalid or expired refresh token';

/**
 * What reuse detection says, and the one authentication failure that is
 * deliberately *not* generic.
 *
 * A client that presented a spent refresh token has just had every one of its
 * sessions revoked, and it cannot be told to "try refreshing" — it must log in
 * again, and the person holding it should know something happened. Saying so
 * reveals nothing an attacker did not already know: they are the one who
 * presented the token.
 */
export const REFRESH_TOKEN_REUSED_MESSAGE =
  'This session has been ended for security reasons; please sign in again';

/**
 * Bounds on a refresh token arriving in a body.
 *
 * `POST /auth/refresh` is public, so this is the size an unauthenticated caller
 * may push into a SHA-256 and a JWT parse. A refresh token is a compact JWS with
 * a fixed three-claim payload, which lands a little over 200 characters; the
 * bounds are wide enough that a longer `sub` or an extra claim would not break
 * the endpoint, and narrow enough that nothing resembling a payload gets in.
 *
 * Shape only. Whether the token is real is the signature's answer and then the
 * database's, and neither is asked until the string is plausibly a token.
 */
export const REFRESH_TOKEN_MIN_LENGTH = 40;

export const REFRESH_TOKEN_MAX_LENGTH = 1024;

/**
 * How much of the client's self-description is kept beside an issued token.
 *
 * `User-Agent` is unbounded on the wire and attacker-controlled, so it is
 * truncated rather than trusted: these two columns exist to help a person
 * recognise their own sessions after an incident, and no investigation needs
 * more than the first two hundred characters of a browser string. An address is
 * bounded by what an IPv6 address plus a port can be, with room for the
 * `x-forwarded-for` chain being cut down to its first entry.
 */
export const USER_AGENT_MAX_LENGTH = 200;

export const IP_ADDRESS_MAX_LENGTH = 64;
