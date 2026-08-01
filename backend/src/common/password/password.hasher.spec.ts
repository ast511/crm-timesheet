import {
  BCRYPT_COST_FACTOR,
  hashPassword,
  verifyPassword,
} from './password.hasher';

const PASSWORD = 'Development123!';

/** A cost-12 hash takes a few hundred ms; the default 5 s timeout is tight. */
const TIMEOUT_MS = 30_000;

describe('password.hasher', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
  }, TIMEOUT_MS);

  describe('hashPassword', () => {
    it('never returns the plain-text password', () => {
      expect(passwordHash).not.toContain(PASSWORD);
    });

    it('encodes the configured cost factor in the hash', () => {
      expect(passwordHash).toMatch(
        new RegExp(`^\\$2[aby]\\$${BCRYPT_COST_FACTOR}\\$`),
      );
    });

    it(
      'produces a different hash every time, because the salt is random',
      async () => {
        await expect(hashPassword(PASSWORD)).resolves.not.toBe(passwordHash);
      },
      TIMEOUT_MS,
    );

    it('rejects a password longer than bcrypt can hash', async () => {
      await expect(hashPassword('x'.repeat(73))).rejects.toThrow(/72 bytes/);
    });
  });

  describe('verifyPassword', () => {
    it(
      'accepts the correct password',
      async () => {
        await expect(verifyPassword(PASSWORD, passwordHash)).resolves.toBe(
          true,
        );
      },
      TIMEOUT_MS,
    );

    it(
      'rejects a wrong password',
      async () => {
        await expect(
          verifyPassword('wrong-password', passwordHash),
        ).resolves.toBe(false);
      },
      TIMEOUT_MS,
    );

    it('rejects over-long input instead of comparing a truncated prefix', async () => {
      await expect(
        verifyPassword(PASSWORD.padEnd(73, 'x'), passwordHash),
      ).resolves.toBe(false);
    });
  });
});
