import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { UserRole } from '../../../generated/prisma/enums';
import { UpdateUserDto } from './update-user.dto';

/**
 * Only the differences from `CreateUserDto` are asserted here — the shared
 * constraints are covered by that spec, because both DTOs apply the very same
 * decorators.
 */
describe('UpdateUserDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: UpdateUserDto,
  };

  const validate = (body: unknown): Promise<UpdateUserDto> =>
    pipe.transform(body, metadata) as Promise<UpdateUserDto>;

  it('accepts an empty body', async () => {
    await expect(validate({})).resolves.toBeDefined();
  });

  it('accepts a single field on its own', async () => {
    const dto = await validate({ role: UserRole.HR });

    expect(dto.role).toBe(UserRole.HR);
    expect(dto.username).toBeUndefined();
  });

  it('normalises a username exactly as creation does', async () => {
    const dto = await validate({ username: '  APO  ' });

    expect(dto.username).toBe('APO');
  });

  it('accepts an explicit null username as "remove it"', async () => {
    const dto = await validate({ username: null });

    expect(dto.username).toBeNull();
  });

  /**
   * The three fields Feature 036 removed, and each for its own reason.
   *
   * `password`: nobody sets somebody else's password any more — the owner uses
   * `POST /auth/change-password`, or recovers through `forgot-password`.
   * `isActive`: the column is gone, replaced by a three-state `status`.
   * `status`: enabling and disabling are transitions with side effects
   * (deactivating revokes live sessions), so they are `POST` sub-resources
   * rather than a field a patch may write.
   *
   * Asserted as rejections rather than as silence: a client written against the
   * old contract is told which property is not accepted, instead of believing it
   * disabled an account that is still working.
   */
  it.each([
    ['a password', { password: 'a whole new secret' }],
    ['an isActive flag', { isActive: false }],
    ['an account status', { status: 'DISABLED' }],
  ])('rejects %s', async (_case, body) => {
    await expect(validate(body)).rejects.toThrow();
  });

  /**
   * `email` is not an editable field: changing an account's identity needs the
   * new address proven reachable first, which belongs with email verification.
   * Being absent from the class, it is rejected rather than silently dropped —
   * a caller who thinks they renamed an account finds out immediately.
   */
  it('rejects an email, which is not editable through this endpoint', async () => {
    await expect(
      validate({ email: 'new.address@example.com' }),
    ).rejects.toThrow();
  });

  it('still rejects a password hash', async () => {
    await expect(
      validate({ passwordHash: '$2b$12$abcdefghij' }),
    ).rejects.toThrow();
  });

  it('still rejects a role outside the enum', async () => {
    await expect(validate({ role: 'ROOT' })).rejects.toThrow();
    await expect(validate({ role: UserRole.HR })).resolves.toBeDefined();
  });

  it('still rejects an unknown property', async () => {
    await expect(validate({ nickname: 'Ana' })).rejects.toThrow();
  });
});
