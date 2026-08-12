import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { EMAIL_MAX_LENGTH } from '../../../common/constants/email.constants';
import { UserRole } from '../../../generated/prisma/enums';
import { USER_USERNAME_MAX_LENGTH } from '../user.constants';
import { CreateUserDto } from './create-user.dto';

/**
 * Run through a `ValidationPipe` configured exactly like the global one, so
 * what is asserted here is the object the controller receives — transforms
 * included, since normalising `email` before the uniqueness check is what makes
 * the database's unique index authoritative.
 *
 * **The password tests are gone, because the field is.** Feature 036 removed
 * `password` from this body: an account is created with none and its owner sets
 * one through an emailed link. The rule those tests covered did not disappear —
 * it moved to `common/password/password.policy.ts`, where the three auth bodies
 * that *do* accept a password share it, and it is tested there once instead of
 * per DTO.
 */
describe('CreateUserDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateUserDto,
  };

  const validate = (body: unknown): Promise<CreateUserDto> =>
    pipe.transform(body, metadata) as Promise<CreateUserDto>;

  const VALID = {
    email: 'ana.pop@example.com',
    role: UserRole.ADMIN,
  };

  it('accepts a payload with only email and role', async () => {
    const dto = await validate(VALID);

    expect(dto.email).toBe('ana.pop@example.com');
    expect(dto.role).toBe(UserRole.ADMIN);
    expect(dto.username).toBeUndefined();
  });

  it('trims and lower-cases the email', async () => {
    const dto = await validate({ ...VALID, email: '  Ana.Pop@Example.COM  ' });

    expect(dto.email).toBe('ana.pop@example.com');
  });

  it('trims the username but keeps its case', async () => {
    const dto = await validate({ ...VALID, username: '  APO  ' });

    expect(dto.username).toBe('APO');
  });

  it('turns a blank username into null', async () => {
    const dto = await validate({ ...VALID, username: '   ' });

    expect(dto.username).toBeNull();
  });

  it.each(Object.values(UserRole))('accepts the role %s', async (role) => {
    const dto = await validate({ ...VALID, role });

    expect(dto.role).toBe(role);
  });

  /**
   * The three fields Feature 036 removed, asserted as **rejections rather than
   * as silence**.
   *
   * `forbidNonWhitelisted` turns each into a `400` naming the property, which is
   * the behaviour that matters for a client written against the old contract: an
   * integrator who sends `password` is told plainly that it is not accepted,
   * instead of creating an account whose password they believe they set and
   * whose owner cannot sign in.
   */
  it.each([
    ['a password', { password: 'correct horse battery' }],
    ['a password hash', { passwordHash: '$2b$12$abcdefghij' }],
    ['an isActive flag', { isActive: true }],
    ['an account status', { status: 'ACTIVE' }],
  ])('rejects %s: onboarding is an emailed link', async (_case, extra) => {
    await expect(validate({ ...VALID, ...extra })).rejects.toThrow();
  });

  it.each([
    ['a missing email', { role: UserRole.USER }],
    ['a missing role', { email: 'a@example.com' }],
    ['a malformed email', { ...VALID, email: 'not-an-email' }],
    ['a blank email', { ...VALID, email: '   ' }],
    ['a role outside the enum', { ...VALID, role: 'ROOT' }],
    ['a lower-cased role', { ...VALID, role: 'admin' }],
    ['a non-string username', { ...VALID, username: 42 }],
    ['an unknown property', { ...VALID, nickname: 'Ana' }],
  ])('rejects %s', async (_case, body) => {
    await expect(validate(body)).rejects.toThrow();
  });

  it.each([
    ['email', EMAIL_MAX_LENGTH],
    ['username', USER_USERNAME_MAX_LENGTH],
  ])('rejects a %s above its maximum length', async (field, maxLength) => {
    // Kept a valid address so it is the length that fails, not the format.
    const value =
      field === 'email'
        ? `${'a'.repeat(maxLength)}@example.com`
        : 'a'.repeat(maxLength + 1);

    await expect(validate({ ...VALID, [field]: value })).rejects.toThrow();
  });
});
