import { compare, hash } from 'bcryptjs';

/**
 * The project's single password hashing strategy: bcrypt, via `bcryptjs`.
 *
 * Everything that stores or checks a password goes through this module — the
 * database seed today, the `auth` module tomorrow — so the algorithm and its
 * cost factor are decided in exactly one place.
 *
 * `bcryptjs` is the pure-JavaScript implementation, chosen over the native
 * `bcrypt` binding so `npm install` needs no compiler toolchain on any
 * developer machine or CI runner. It produces and accepts the same `$2a$`/
 * `$2b$` hashes, so switching to the native binding later would not invalidate
 * a single stored hash. The trade-off is speed: it is roughly two to three
 * times slower per hash and, unlike the native binding, runs on the main
 * thread rather than the libuv thread pool.
 */

/**
 * bcrypt work factor. Each increment doubles the time a single hash takes.
 *
 * 12 is the current OWASP baseline: slow enough to make offline cracking
 * expensive and fast enough for an interactive login (a few hundred
 * milliseconds with `bcryptjs` on ordinary hardware). Changing it later is
 * safe — bcrypt stores the cost inside the hash, so existing hashes keep
 * verifying with the factor they were created with.
 */
export const BCRYPT_COST_FACTOR = 12;

/**
 * bcrypt hashes at most 72 bytes and silently ignores the rest. Left
 * unchecked, two long passwords sharing their first 72 bytes would be
 * interchangeable, so the limit is enforced rather than tolerated.
 */
const MAX_PASSWORD_BYTES = 72;

/** Hashes a plain-text password. The salt is generated per call by bcrypt. */
export async function hashPassword(plainPassword: string): Promise<string> {
  if (exceedsBcryptLimit(plainPassword)) {
    throw new Error(
      `A password may not exceed ${MAX_PASSWORD_BYTES} bytes; bcrypt would silently truncate it.`,
    );
  }

  return hash(plainPassword, BCRYPT_COST_FACTOR);
}

/**
 * Checks a plain-text password against a stored hash.
 *
 * Over-long input returns `false` instead of throwing: no such password can
 * ever have been hashed by `hashPassword`, and an authentication check should
 * answer "no" rather than fail loudly on attacker-controlled input.
 */
export async function verifyPassword(
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> {
  if (exceedsBcryptLimit(plainPassword)) {
    return false;
  }

  return compare(plainPassword, passwordHash);
}

/** Byte length, not character length — a non-ASCII character costs 2–4 bytes. */
function exceedsBcryptLimit(password: string): boolean {
  return Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES;
}
