/**
 * Every error code this API can return, in one place.
 *
 * ## What a code is for
 *
 * The `message` on an error envelope is English, written for whoever is reading
 * a log or a stack trace. It is **not** what a user should be shown, and it is
 * not what a frontend should branch on: it is prose, it is free to be reworded,
 * and translating it would mean matching on sentences.
 *
 * A code is the other half. It says *what happened* in a form a program can act
 * on, and it lets the frontend decide *how to say it* — in Romanian, in English,
 * or in whatever language the company adds next. The backend never emits
 * localized text and holds no translations; see `FEATURES/033`.
 *
 * ## Codes are a contract; messages are not
 *
 * **Renaming a code is a breaking change.** A frontend has a translation keyed by
 * it, so a rename is a string that silently stops resolving and a screen that
 * shows a key instead of a sentence. Rewording the English message beside it
 * costs nothing and needs no coordination — which is exactly the split this file
 * exists to create.
 *
 * Adding a code is not breaking, as long as the frontend falls back sensibly for
 * one it does not know. Removing one is.
 *
 * ## Conventions
 *
 * - `SCREAMING_SNAKE_CASE`, namespaced by area with a leading `AUTH_`,
 *   `TIMESHEET_`, `LEAVE_` … prefix, so a reader can tell at a glance which
 *   part of the application a code came from and a translation file can be
 *   grouped the same way.
 * - Each code carries a comment saying what it means and, when it has any, what
 *   `params` accompany it — because a translation string interpolating
 *   `{{month}}` needs to know that `month` will be there.
 * - Referenced by symbol, never typed as a literal at a throw site. That is what
 *   {@link ErrorCode} enforces: `codedError` takes this type, so a typo is a
 *   compile error rather than a code the frontend has no translation for.
 *
 * ## What is here, and what is not
 *
 * Feature 033 seeded this with the generic codes and the auth ones, because
 * authentication is where the errors a *user* actually sees begin — a wrong
 * password, an expired session — and because it was the module that had just
 * been written. The other modules still throw uncoded exceptions and still
 * produce a valid envelope without an `errorCode`; they gain codes gradually, as
 * each is touched. See `FEATURES/033` for that approach and why it was chosen
 * over one sweeping change across thirty tested modules.
 */

/**
 * Structured values accompanying a code, for a translation to interpolate.
 *
 * Deliberately flat and primitive. A translation string substitutes scalars —
 * `"Luna {{month}}/{{year}} este deja blocată"` — and nothing renders a nested
 * object, so allowing one would invite a payload that is really a second
 * response body travelling inside an error.
 */
export type ErrorParams = Record<string, string | number | boolean>;

export const ERROR_CODES = {
  // ---------------------------------------------------------------------------
  // Generic. Neither is thrown by hand: the filter applies them when an
  // exception carries no code of its own, so a frontend always has *something*
  // stable to key on.
  // ---------------------------------------------------------------------------

  /**
   * Any failure the application did not anticipate — a `500`.
   *
   * The message is the fixed `Internal server error`, never the real reason, so
   * this code is all a client gets and all it needs: the only sensible response
   * is "something went wrong, try again", and the details are in the log.
   */
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  /**
   * A request the `ValidationPipe` rejected, or a domain error deliberately
   * shaped like one.
   *
   * One code for the whole failure rather than one per constraint. The
   * per-field `message` array survives untouched beside it, so a form can still
   * put each sentence under its input; this code is what a heading like
   * "Verificați câmpurile marcate" is keyed on. Per-constraint codes are a
   * possible later refinement — see `FEATURES/033`.
   *
   * No params: the detail is the message array.
   */
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  /**
   * The caller sent more requests than the rate limiter allows — a `429`.
   *
   * Generic on purpose, and it is the third code the filter never sees thrown by
   * a domain service: `ApiThrottlerGuard` raises it before a handler runs. One
   * code covers both tiers — the generous per-client baseline every route has and
   * the strict allowance on `POST /auth/login` and `POST /auth/refresh` — because
   * a client's response is the same either way: stop, wait, try again. Telling
   * the two apart would publish which limit was hit and therefore what the other
   * one is, to precisely the caller who is probing for it.
   *
   * The response carries a `Retry-After` header giving the wait in seconds, and
   * a client should respect it rather than retrying immediately: a retry loop
   * against a limiter extends the block instead of shortening it.
   *
   * No params. The numbers are deployment configuration and would tell an
   * attacker how much room they have left.
   */
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // ---------------------------------------------------------------------------
  // Authentication (Feature 032).
  // ---------------------------------------------------------------------------

  /**
   * `POST /auth/login` refused the credentials.
   *
   * **One code for all three causes** — no such address, wrong password, and a
   * deactivated account — because Feature 032 answers all three with one status
   * and one message, and equalises their timing. Splitting them here would undo
   * that from the one place nobody would think to look: a distinct code for a
   * deactivated account would confirm both that the address exists and that the
   * password was right, which in a company's internal system also answers "does
   * this person work here".
   *
   * {@link AUTH_INACTIVE_USER} exists for the paths where the caller has
   * *already* proved they hold a credential for that account, and it is
   * deliberately unreachable from login.
   *
   * No params.
   */
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',

  /**
   * The account behind an otherwise valid token has `is_active = false`.
   *
   * Reached on refresh and on any authenticated request — never on login. The
   * distinction is what makes it safe to be specific: a caller presenting a
   * valid token for this account is either its owner or somebody who already
   * stole a credential from it, and neither learns anything new. What it buys is
   * the difference between "sign in again", which would fail forever, and
   * "your account has been deactivated, speak to HR".
   *
   * No params. Which account it is, is not the client's business to be told.
   */
  AUTH_INACTIVE_USER: 'AUTH_INACTIVE_USER',

  /**
   * A refresh token that cannot be exchanged: malformed, unsigned by us,
   * expired, revoked by a logout, or matching no stored row.
   *
   * One code for all of them, matching the single message Feature 032 answers
   * with. The client behaviour is identical in every case — discard the session
   * and show the login screen — so distinguishing them would publish which
   * without changing anything.
   *
   * No params.
   */
  AUTH_REFRESH_TOKEN_INVALID: 'AUTH_REFRESH_TOKEN_INVALID',

  /**
   * A refresh token that had already been rotated was presented again.
   *
   * The one authentication failure that is deliberately *not* generic. Rotation
   * makes a refresh token single-use, so a spent one coming back means two
   * parties hold one credential; every live session of the account has just been
   * revoked and the caller cannot recover by refreshing. It is a different
   * message to the user from an ordinary expiry — "your session was ended for
   * security reasons" — which is the whole reason it has its own code.
   *
   * No params.
   */
  AUTH_REFRESH_TOKEN_REUSED: 'AUTH_REFRESH_TOKEN_REUSED',

  /**
   * A protected route was called with no access token, or with one that is
   * malformed, expired, forged, or names an account that no longer exists.
   *
   * The frontend's cue to attempt a refresh and, failing that, to send the
   * person to the login screen. It is the most frequently emitted code in the
   * application by some distance, because it is what an expired access token
   * produces on every ordinary request.
   *
   * No params.
   */
  AUTH_UNAUTHENTICATED: 'AUTH_UNAUTHENTICATED',

  /**
   * The caller is authenticated, but the route is about their own employment
   * record and their account has none.
   *
   * A super-admin created to administer the system is the case this exists for.
   * It is a `403` rather than a `401` — nothing is wrong with the credential —
   * and the user-facing sentence is about the account rather than the session,
   * which is why it cannot share {@link AUTH_UNAUTHENTICATED}.
   *
   * No params.
   */
  AUTH_NO_EMPLOYEE_RECORD: 'AUTH_NO_EMPLOYEE_RECORD',

  // ---------------------------------------------------------------------------
  // Authorization (Feature 035).
  // ---------------------------------------------------------------------------

  /**
   * The caller is authenticated, and does not hold the permission the route
   * declares — a `403` from `PermissionsGuard`.
   *
   * **The code that separates "who are you" from "may you".** Everything above
   * with an `AUTH_` prefix is about the credential; this one is about the
   * account behind a credential that was perfectly good. A frontend's response
   * to it is therefore the opposite of its response to
   * {@link AUTH_UNAUTHENTICATED}: refreshing the token will not help and sending
   * the person to the login screen would be a lie, because signing in again
   * produces exactly the same refusal. The right screen is "you do not have
   * access to this — ask an administrator", and the right long-term fix is a
   * permission granted through the permissions screen.
   *
   * One code for every gated route rather than one per permission, for the
   * reason `RATE_LIMIT_EXCEEDED` is one code for two tiers: the client's
   * behaviour does not vary, and the *which* travels in `params`.
   *
   * Params:
   *
   * - `requiredPermissions` — the key the route declares, or several joined by
   *   `", "`, so a message can name what is missing. Publishing it is safe: it
   *   is the route's own requirement, which the person on the other side just
   *   met, and it is already visible in this project's documentation. What is
   *   **not** returned is the caller's effective set — that would turn every
   *   refusal into a map of the account's remaining reach.
   * - `mode` — `ALL` or `ANY`, so a message can say "all of" rather than
   *   implying the caller needs only one of several listed keys.
   */
  AUTHORIZATION_PERMISSION_DENIED: 'AUTHORIZATION_PERMISSION_DENIED',

  /**
   * The caller is authenticated, and is not `ADMIN` or `SUPERADMIN` — a `403`
   * on an account or role-management route.
   *
   * Separate from {@link AUTHORIZATION_PERMISSION_DENIED} because there is
   * nothing to grant. That code means "ask an administrator for this
   * permission"; this one means "this is not something your role can be given",
   * and a frontend that offered a "request access" link for it would be
   * promising something no screen in this application can do. The rigid boundary
   * it enforces is argued on `ACCOUNT_ADMIN_ROLES`.
   *
   * **HR meets this code**, which is the case it mostly exists for: HR manages
   * employees and never accounts or roles, so an HR user who reaches a `/users`
   * write is being told about a boundary rather than about a missing checkbox.
   *
   * No params. Which roles would have been allowed is in the message, and it is
   * not a secret — but it is not a translation variable either.
   */
  AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED: 'AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED',

  // ---------------------------------------------------------------------------
  // Account lifecycle (Feature 036).
  // ---------------------------------------------------------------------------

  /**
   * An activation or password-reset link that cannot be used: unknown, expired,
   * already followed, or naming an account that is in the wrong state for it.
   *
   * **One code for all four**, and the reason is the one login gives for its
   * single credentials code. These endpoints are `@Public()`: whoever presents a
   * token is unauthenticated and may be anybody, so distinguishing "that link
   * expired" from "that link was never issued" would let somebody with a
   * half-guessed token learn which guesses were real. The client's behaviour is
   * identical in every case — tell the person the link no longer works and how to
   * get a new one.
   *
   * Params: `purpose` — `ACTIVATION` or `PASSWORD_RESET`, so the screen can say
   * "ask your administrator to resend your invitation" rather than "request a new
   * reset link". It leaks nothing: the client just followed a link of that kind
   * and already knows which.
   */
  ACCOUNT_TOKEN_INVALID: 'ACCOUNT_TOKEN_INVALID',

  /**
   * `POST /users/:id/resend-activation` was called for an account that is not
   * `PENDING_ACTIVATION`.
   *
   * Reached only by an authenticated account administrator, so unlike
   * {@link ACCOUNT_TOKEN_INVALID} it can afford to be specific: the caller is
   * looking at the account on a screen and needs to be told that this person has
   * already activated, and that a forgotten password is theirs to reset rather
   * than an invitation to re-send.
   *
   * Params: `status` — the state the account is actually in.
   */
  ACCOUNT_NOT_PENDING_ACTIVATION: 'ACCOUNT_NOT_PENDING_ACTIVATION',

  /**
   * `POST /auth/change-password` was given the wrong `currentPassword`.
   *
   * Distinct from {@link AUTH_INVALID_CREDENTIALS} although both mean "that
   * password is wrong", because the situations have nothing in common. That one
   * is an unauthenticated login attempt and must reveal nothing; this one is a
   * caller who is already signed in as the account, so there is no enumeration to
   * protect against and the honest message — "your current password is not
   * correct" — is what stops somebody assuming their *new* password was rejected.
   *
   * No params.
   */
  ACCOUNT_CURRENT_PASSWORD_INCORRECT: 'ACCOUNT_CURRENT_PASSWORD_INCORRECT',
} as const;

/**
 * Any code in the catalog, as a type.
 *
 * Derived from the object rather than declared beside it, so the two cannot
 * drift: adding a code above adds it here, and `codedError` accepts nothing
 * else. That is what makes "referenced by symbol, never typed as a string" a
 * property the compiler holds rather than a convention a review has to catch.
 */
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
