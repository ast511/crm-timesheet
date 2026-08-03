import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { MAX_PASSWORD_BYTES } from '../../../common/password/password.hasher';
import { UserRole } from '../../../generated/prisma/enums';
import {
  USER_EMAIL_MAX_LENGTH,
  USER_PASSWORD_MIN_LENGTH,
  USER_USERNAME_MAX_LENGTH,
} from '../user.constants';
import { CreateUserDto } from './create-user.dto';

/**
 * Run through a `ValidationPipe` configured exactly like the global one, so
 * what is asserted here is the object the controller receives — transforms
 * included, since normalising `email` before the uniqueness check is what makes
 * the database's unique index authoritative.
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
    password: 'correct horse battery',
    role: UserRole.ADMIN,
  };

  it('accepts a payload with only email, password and role', async () => {
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

  it('keeps the password exactly as typed, spaces included', async () => {
    const dto = await validate({ ...VALID, password: '  spaces matter  ' });

    expect(dto.password).toBe('  spaces matter  ');
  });

  it('has no property for a password hash, so one cannot be supplied', async () => {
    await expect(
      validate({ ...VALID, passwordHash: '$2b$12$abcdefghij' }),
    ).rejects.toThrow();
  });

  it.each(Object.values(UserRole))('accepts the role %s', async (role) => {
    const dto = await validate({ ...VALID, role });

    expect(dto.role).toBe(role);
  });

  it.each([
    ['a missing email', { password: 'correct horse', role: UserRole.USER }],
    ['a missing password', { email: 'a@example.com', role: UserRole.USER }],
    ['a missing role', { email: 'a@example.com', password: 'correct horse' }],
    ['a malformed email', { ...VALID, email: 'not-an-email' }],
    ['a blank email', { ...VALID, email: '   ' }],
    ['a role outside the enum', { ...VALID, role: 'ROOT' }],
    ['a lower-cased role', { ...VALID, role: 'admin' }],
    ['a non-string username', { ...VALID, username: 42 }],
    ['a non-boolean isActive', { ...VALID, isActive: 'yes' }],
    ['an unknown property', { ...VALID, nickname: 'Ana' }],
  ])('rejects %s', async (_case, body) => {
    await expect(validate(body)).rejects.toThrow();
  });

  it('rejects a password below the minimum length', async () => {
    await expect(
      validate({
        ...VALID,
        password: 'a'.repeat(USER_PASSWORD_MIN_LENGTH - 1),
      }),
    ).rejects.toThrow();
  });

  it('accepts a password of exactly the minimum length', async () => {
    const password = 'a'.repeat(USER_PASSWORD_MIN_LENGTH);
    const dto = await validate({ ...VALID, password });

    expect(dto.password).toBe(password);
  });

  it.each([
    ['email', USER_EMAIL_MAX_LENGTH],
    ['username', USER_USERNAME_MAX_LENGTH],
  ])('rejects a %s above its maximum length', async (field, maxLength) => {
    // Kept a valid address so it is the length that fails, not the format.
    const value =
      field === 'email'
        ? `${'a'.repeat(maxLength)}@example.com`
        : 'a'.repeat(maxLength + 1);

    await expect(validate({ ...VALID, [field]: value })).rejects.toThrow();
  });

  /**
   * The bound bcrypt actually imposes is on bytes, and these two cases are the
   * reason it is validated in bytes rather than characters: the first is 72
   * characters and passes, the second is 24 characters — well under any
   * plausible `@MaxLength` — and would silently reach `hashPassword`, which
   * throws.
   */
  it('accepts a password of exactly the bcrypt byte limit', async () => {
    const password = 'a'.repeat(MAX_PASSWORD_BYTES);

    await expect(validate({ ...VALID, password })).resolves.toBeDefined();
  });

  it('rejects a short password whose UTF-8 encoding is over the limit', async () => {
    // Each emoji is 4 bytes: 24 characters, 96 bytes.
    const password = '🔒'.repeat(24);

    expect(password.length).toBeLessThan(MAX_PASSWORD_BYTES);
    expect(Buffer.byteLength(password, 'utf8')).toBeGreaterThan(
      MAX_PASSWORD_BYTES,
    );
    await expect(validate({ ...VALID, password })).rejects.toThrow();
  });
});
