import { EMAIL_MAX_LENGTH } from '../../common/constants/email.constants';
import { ANONYMOUS_IDENTITY, UNKNOWN_CLIENT } from './rate-limiting.constants';
import {
  readClientAddress,
  readSubmittedIdentity,
} from './rate-limiting.guard';

/**
 * The two halves of a bucket key.
 *
 * Both are pure functions of a request, so they are asserted directly here;
 * that the guard composes them into the right key, and that the resulting
 * buckets are actually separate, is asserted over HTTP in `routing.spec.ts`.
 */
describe('readClientAddress', () => {
  /**
   * `request.ip` is Express's answer and has already applied `trust proxy`, so
   * reading it — and nothing else — is what makes the limiter correct in both
   * topologies without knowing which one it is in.
   */
  it('uses the address Express resolved', () => {
    expect(readClientAddress({ ip: '203.0.113.5' })).toBe('203.0.113.5');
  });

  /**
   * The socket is a fallback, never a correction. Behind a trusted proxy the
   * socket holds the proxy's address, which is the one value this must not use.
   */
  it('prefers the resolved address over the raw socket', () => {
    expect(
      readClientAddress({
        ip: '203.0.113.5',
        socket: { remoteAddress: '10.0.0.1' },
      }),
    ).toBe('203.0.113.5');
  });

  it('falls back to the socket when Express resolved nothing', () => {
    expect(readClientAddress({ socket: { remoteAddress: '10.0.0.1' } })).toBe(
      '10.0.0.1',
    );
  });

  /**
   * A shared bucket rather than a fresh one, deliberately: everybody affected
   * being limited together is a visible problem, while a new bucket per request
   * would be a silent hole.
   */
  it.each([{}, { ip: '' }, { socket: {} }])(
    'falls back to one shared bucket for %p',
    (request) => {
      expect(readClientAddress(request)).toBe(UNKNOWN_CLIENT);
    },
  );
});

describe('readSubmittedIdentity', () => {
  /**
   * The folding has to match `@IsEmailAddress()` exactly. This runs in a guard,
   * before the `ValidationPipe` has built a DTO, so a different folding here
   * would mean `Maria@company.com` and `maria@company.com` were two buckets
   * against one account — the strict allowance doubling for every capitalisation
   * an attacker could think of.
   */
  it.each([
    'maria.ionescu@company.com',
    'Maria.Ionescu@Company.com',
    '  MARIA.IONESCU@COMPANY.COM  ',
  ])('folds %p to one identity', (email) => {
    expect(readSubmittedIdentity({ body: { email } })).toBe(
      'maria.ionescu@company.com',
    );
  });

  /** `POST /auth/refresh` carries a token and no address. */
  it.each([
    { body: undefined },
    { body: null },
    { body: 'a string' },
    { body: {} },
    { body: { refreshToken: 'r'.repeat(64) } },
  ])('reads no identity from %p', (request) => {
    expect(readSubmittedIdentity(request)).toBe(ANONYMOUS_IDENTITY);
  });

  /** A caller controls this field, so it is never trusted to be a string. */
  it.each([
    { email: 42 },
    { email: null },
    { email: ['a@b.com'] },
    { email: {} },
  ])('reads no identity from an email of %p', (body) => {
    expect(readSubmittedIdentity({ body })).toBe(ANONYMOUS_IDENTITY);
  });

  it('reads no identity from a blank address', () => {
    expect(readSubmittedIdentity({ body: { email: '   ' } })).toBe(
      ANONYMOUS_IDENTITY,
    );
  });

  /**
   * The body parser caps a payload at 100 kB, which without this bound is 100 kB
   * of map-key material per request.
   */
  it('bounds the identity at the length of a deliverable address', () => {
    const identity = readSubmittedIdentity({
      body: { email: `${'a'.repeat(5000)}@company.com` },
    });

    expect(identity).toHaveLength(EMAIL_MAX_LENGTH);
  });
});
