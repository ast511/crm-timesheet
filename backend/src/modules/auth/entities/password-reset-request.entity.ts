/**
 * The answer to `POST /auth/forgot-password`, and the only endpoint in this API
 * whose payload is a sentence.
 *
 * **The same body whatever happened.** Whether the address names an active
 * account, a pending one, a disabled one, or nobody at all, this endpoint
 * returns the same status and the same message — that is the no-enumeration
 * rule, and a payload derived from what actually occurred would undo it from the
 * one place nobody would think to look.
 *
 * The message is returned as data rather than left to the client to invent, so
 * every frontend says the same careful thing. A client that rendered "check your
 * inbox" unconditionally would be lying to whoever mistyped their address, which
 * is precisely the person this careful wording exists for.
 *
 * A class in `entities/` since Feature 038 rather than an inline
 * `Promise<{ message: string }>` on the controller: the shape is part of the
 * published contract and the generated documentation needs something to name.
 */
export class PasswordResetRequestedEntity {
  /**
   * The fixed sentence — see `PASSWORD_RESET_REQUESTED_MESSAGE`.
   *
   * English, and a client is free to show its own translation instead. What it
   * must not do is show a *different claim*: anything that asserts an email was
   * sent turns a deliberately ambiguous answer into an account-enumeration
   * oracle.
   */
  message!: string;
}
