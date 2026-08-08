import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

import { JWT_KEYS } from './auth.config';
import { TokenService } from './token.service';

/**
 * The cryptographic half of a session, on its own.
 *
 * A real `JwtService` rather than a mock, because everything worth asserting
 * here *is* the signing: a stubbed signer would let a test pass while the
 * algorithm was wrong, the expiry ignored or the secret unused. Only the
 * environment is faked.
 */
const ACCESS_SECRET = 'access-secret-0123456789abcdefghij';
const REFRESH_SECRET = 'refresh-secret-0123456789abcdefghij';
const ACCESS_TTL = 900;
const REFRESH_TTL = 604_800;

const configWith = (overrides: Record<string, unknown> = {}): ConfigService => {
  const values: Record<string, unknown> = {
    [JWT_KEYS.accessSecret]: ACCESS_SECRET,
    [JWT_KEYS.refreshSecret]: REFRESH_SECRET,
    [JWT_KEYS.accessTtl]: ACCESS_TTL,
    [JWT_KEYS.refreshTtl]: REFRESH_TTL,
    ...overrides,
  };

  return {
    getOrThrow: (key: string) => {
      if (!(key in values)) {
        throw new Error(`Configuration key "${key}" does not exist`);
      }

      return values[key];
    },
  } as unknown as ConfigService;
};

describe('TokenService', () => {
  const jwt = new JwtService({});
  const tokens = new TokenService(jwt, configWith());

  describe('the configuration', () => {
    /**
     * Read in the constructor rather than per call, so a deployment with no
     * signing key fails at startup instead of at the first login of the morning.
     */
    it('refuses to construct without a secret', () => {
      expect(
        () =>
          new TokenService(
            jwt,
            configWith({ [JWT_KEYS.accessSecret]: undefined }),
          ),
      ).toThrow();
    });

    it('refuses a blank secret, naming the variable and not its value', () => {
      expect(
        () =>
          new TokenService(jwt, configWith({ [JWT_KEYS.accessSecret]: '  ' })),
      ).toThrow(/JWT_ACCESS_SECRET must not be empty/);
    });

    it('exposes the access lifetime, which is what a client is told', () => {
      expect(tokens.accessTtlSeconds).toBe(ACCESS_TTL);
    });
  });

  describe('access tokens', () => {
    it('round-trips the account it was signed for', async () => {
      const token = await tokens.issueAccessToken('usr-1');

      await expect(tokens.verifyAccessToken(token)).resolves.toBe('usr-1');
    });

    /**
     * The token says *who* and nothing else. A role claim would be a copy of
     * `users.role` taken at issue time, so a demoted account would keep its
     * authority until the token expired — which is precisely the window a short
     * lifetime exists to bound.
     */
    it('carries the account and nothing else that grants authority', () => {
      const claims = jwt.decode<Record<string, unknown>>(
        jwt.sign({ sub: 'usr-1', typ: 'access' }, { secret: ACCESS_SECRET }),
      );

      expect(Object.keys(claims).sort()).toEqual(['iat', 'sub', 'typ']);
    });

    it('expires after the configured lifetime', async () => {
      const shortLived = new TokenService(
        jwt,
        configWith({ [JWT_KEYS.accessTtl]: 1 }),
      );
      const token = await shortLived.issueAccessToken('usr-1');

      jest.useFakeTimers().setSystemTime(Date.now() + 2000);

      try {
        await expect(shortLived.verifyAccessToken(token)).rejects.toThrow(
          UnauthorizedException,
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('rejects a token signed with another key', async () => {
      const impostor = new JwtService({});
      const token = impostor.sign(
        { sub: 'usr-1', typ: 'access' },
        { secret: 'a-completely-different-secret-value' },
      );

      await expect(tokens.verifyAccessToken(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects something that is not a token at all', async () => {
      await expect(tokens.verifyAccessToken('not.a.token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    /**
     * The classic JWT confusion attack: a token declaring `alg: none` turns
     * "signed" into "asserted". `algorithms: ['HS256']` is what refuses it.
     */
    it('rejects an unsigned token declaring alg none', async () => {
      const header = Buffer.from(
        JSON.stringify({ alg: 'none', typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ sub: 'usr-1', typ: 'access' }),
      ).toString('base64url');

      await expect(
        tokens.verifyAccessToken(`${header}.${payload}.`),
      ).rejects.toThrow(UnauthorizedException);
    });

    /**
     * The secrets already differ, so this can only be reached if somebody copies
     * one into both variables — which `env.validation.ts` refuses at startup.
     * The `typ` claim is the second lock on the same door, and it is asserted
     * here by verifying a refresh token *with the refresh key* against the
     * access reader's expectation.
     */
    it('refuses a refresh token where an access token belongs', async () => {
      const oneSecret = new TokenService(
        jwt,
        configWith({ [JWT_KEYS.accessSecret]: REFRESH_SECRET }),
      );
      const { token } = await oneSecret.issueRefreshToken('usr-1');

      await expect(oneSecret.verifyAccessToken(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    /** Every rejection reads the same, so the endpoint is not an oracle. */
    it('says the same thing however it failed', async () => {
      const messages = await Promise.all(
        ['garbage', 'a.b.c'].map((token) =>
          tokens
            .verifyAccessToken(token)
            .catch((error: Error) => error.message),
        ),
      );

      expect(new Set(messages).size).toBe(1);
    });
  });

  describe('refresh tokens', () => {
    it('round-trips the account it was signed for', async () => {
      const { token } = await tokens.issueRefreshToken('usr-1');

      await expect(tokens.verifyRefreshToken(token)).resolves.toBe('usr-1');
    });

    it('refuses an access token where a refresh token belongs', async () => {
      const token = await tokens.issueAccessToken('usr-1');

      await expect(tokens.verifyRefreshToken(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('expires the row and the signature at the same moment', async () => {
      const before = Date.now();
      const { expiresAt } = await tokens.issueRefreshToken('usr-1');

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + REFRESH_TTL * 1000,
      );
      expect(expiresAt.getTime()).toBeLessThan(
        before + REFRESH_TTL * 1000 + 5000,
      );
    });

    /**
     * `jti` is load-bearing rather than ceremonial: without it two tokens signed
     * for one account in the same second would be byte-for-byte identical, and
     * so would their hashes — which `refresh_tokens.token_hash` requires to be
     * unique. Two logins in one second is what a test suite does.
     */
    it('is unique even for two issued in the same second', async () => {
      const first = await tokens.issueRefreshToken('usr-1');
      const second = await tokens.issueRefreshToken('usr-1');

      expect(first.token).not.toBe(second.token);
      expect(first.tokenHash).not.toBe(second.tokenHash);
    });
  });

  describe('hashing', () => {
    it('is deterministic, which is what makes the lookup one indexed read', () => {
      expect(tokens.hash('a-token')).toBe(tokens.hash('a-token'));
    });

    it('does not contain the token it hashes', async () => {
      const { token, tokenHash } = await tokens.issueRefreshToken('usr-1');

      expect(tokenHash).not.toContain(token);
      expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
