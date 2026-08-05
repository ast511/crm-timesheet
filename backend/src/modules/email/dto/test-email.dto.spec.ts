import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { EMAIL_MAX_LENGTH } from '../../../common/constants/email.constants';
import { TestEmailDto } from './test-email.dto';

/**
 * Run through a `ValidationPipe` configured exactly like the global one, so
 * what is asserted here is the object the controller receives.
 */
describe('TestEmailDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: TestEmailDto,
  };

  const validate = (body: unknown): Promise<TestEmailDto> =>
    pipe.transform(body, metadata) as Promise<TestEmailDto>;

  it('accepts an address', async () => {
    const dto = await validate({ email: 'john@example.com' });

    expect(dto).toEqual({ email: 'john@example.com' });
  });

  it('trims and lower-cases, like every other address in this API', async () => {
    const dto = await validate({ email: '  John@Example.com  ' });

    expect(dto.email).toBe('john@example.com');
  });

  it.each(['not-an-email', 'john@', '@example.com', '', '   '])(
    'rejects %p',
    async (email) => {
      await expect(validate({ email })).rejects.toThrow();
    },
  );

  it('rejects a missing address', async () => {
    await expect(validate({})).rejects.toThrow();
  });

  it('rejects an address above the RFC 5321 length', async () => {
    const email = `${'a'.repeat(EMAIL_MAX_LENGTH)}@example.com`;

    await expect(validate({ email })).rejects.toThrow();
  });

  /**
   * The endpoint has no authentication in front of it yet, so what keeps it
   * from being a way to send arbitrary mail from the company's server is that
   * the message is fixed. `forbidNonWhitelisted` is what enforces it.
   */
  it.each([
    { email: 'john@example.com', subject: 'Anything I like' },
    { email: 'john@example.com', html: '<p>Click here</p>' },
    { email: 'john@example.com', bcc: ['everyone@example.com'] },
  ])('refuses an attempt to steer the message: %p', async (body) => {
    await expect(validate(body)).rejects.toThrow();
  });
});
