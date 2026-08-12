import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { ActivateAccountDto } from '../../modules/auth/dto/activate-account.dto';
import { ChangePasswordDto } from '../../modules/auth/dto/change-password.dto';
import { ResetPasswordDto } from '../../modules/auth/dto/reset-password.dto';
import { MAX_PASSWORD_BYTES } from './password.hasher';
import { PASSWORD_MIN_LENGTH } from './password.policy';

/**
 * One policy, enforced identically wherever a password can be set.
 *
 * **The `it.each` over three DTOs is the point of this file.** Before Feature
 * 036 the rule lived in the users module and applied to one body; now a password
 * arrives from three directions — activating a new account, resetting a
 * forgotten one, changing a known one — and the way that goes wrong is not that
 * somebody forgets the rule entirely. It is that the strict version guards the
 * path everybody uses while a weaker one guards the path an attacker reaches
 * for. Testing the three together is what makes "identically" an assertion
 * rather than a claim in a comment.
 *
 * A valid token is supplied to the two that need one so that it is always the
 * *password* under test; a body failing for the wrong reason would pass these
 * assertions for nothing.
 */
describe('the password policy', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  /** 32 bytes of base64url — the length `@IsAccountToken()` demands. */
  const TOKEN = 'A'.repeat(43);

  /**
   * The three bodies, each reduced to "here is a password" so one table can
   * drive all of them. The field name differs on purpose — `password` at
   * activation, `newPassword` where something is being replaced — and that
   * difference is part of each DTO's contract, so it is expressed here rather
   * than normalised away.
   */
  const bodies: [
    string,
    ArgumentMetadata['metatype'],
    (p: string) => object,
  ][] = [
    [
      'ActivateAccountDto',
      ActivateAccountDto,
      (password) => ({ token: TOKEN, password }),
    ],
    [
      'ResetPasswordDto',
      ResetPasswordDto,
      (newPassword) => ({ token: TOKEN, newPassword }),
    ],
    [
      'ChangePasswordDto',
      ChangePasswordDto,
      (newPassword) => ({ currentPassword: 'whatever it was', newPassword }),
    ],
  ];

  const validate = (
    metatype: ArgumentMetadata['metatype'],
    body: object,
  ): Promise<unknown> => pipe.transform(body, { type: 'body', metatype });

  describe.each(bodies)('%s', (_name, metatype, build) => {
    it('accepts a password of exactly the minimum length', async () => {
      await expect(
        validate(metatype, build('a'.repeat(PASSWORD_MIN_LENGTH))),
      ).resolves.toBeDefined();
    });

    it('rejects one character below the minimum', async () => {
      await expect(
        validate(metatype, build('a'.repeat(PASSWORD_MIN_LENGTH - 1))),
      ).rejects.toThrow();
    });

    /**
     * The bound bcrypt actually imposes is on **bytes**, and these two cases are
     * why it is validated in bytes rather than characters: the first is 72
     * characters and passes, the second is 24 characters — well under any
     * plausible `@MaxLength` — and would otherwise reach `hashPassword`, which
     * throws and would surface as a `500`.
     */
    it('accepts a password of exactly the bcrypt byte limit', async () => {
      await expect(
        validate(metatype, build('a'.repeat(MAX_PASSWORD_BYTES))),
      ).resolves.toBeDefined();
    });

    it('rejects a short password whose UTF-8 encoding is over the limit', async () => {
      // Each emoji is 4 bytes: 24 characters, 96 bytes.
      const password = '🔒'.repeat(24);

      expect(password.length).toBeLessThan(MAX_PASSWORD_BYTES);
      expect(Buffer.byteLength(password, 'utf8')).toBeGreaterThan(
        MAX_PASSWORD_BYTES,
      );

      await expect(validate(metatype, build(password))).rejects.toThrow();
    });

    /**
     * Not trimmed, anywhere. Leading and trailing spaces are legitimate
     * characters in a passphrase, and folding them would mean the password
     * accepted at activation is not the password somebody typed — which
     * surfaces later as a login that will not work.
     */
    it('keeps the password exactly as typed, spaces included', async () => {
      const password = '  spaces matter  ';
      const dto = (await validate(metatype, build(password))) as Record<
        string,
        unknown
      >;

      expect(dto.password ?? dto.newPassword).toBe(password);
    });

    it('rejects a non-string', async () => {
      await expect(
        validate(metatype, build(42 as unknown as string)),
      ).rejects.toThrow();
    });
  });

  /**
   * `currentPassword` is deliberately **not** held to the policy.
   *
   * It is a value being checked rather than stored, so a floor on it would
   * reject — with a `400` naming the field — a caller whose real password
   * predates the policy, and would turn the endpoint into a length oracle: a
   * seven-character guess refused in a visibly different way from a wrong
   * eight-character one. It is bounded only so an authenticated caller cannot
   * push an unbounded string into a bcrypt comparison.
   */
  describe('ChangePasswordDto.currentPassword', () => {
    const body = (currentPassword: string) => ({
      currentPassword,
      newPassword: 'a perfectly good new one',
    });

    it('accepts a short current password rather than judging it', async () => {
      await expect(
        validate(ChangePasswordDto, body('short')),
      ).resolves.toBeDefined();
    });

    it('still bounds it, so nothing unbounded reaches bcrypt', async () => {
      await expect(
        validate(ChangePasswordDto, body('a'.repeat(MAX_PASSWORD_BYTES + 1))),
      ).rejects.toThrow();
    });
  });
});
