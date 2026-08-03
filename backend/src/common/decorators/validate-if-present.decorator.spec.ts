import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';

import { ValidateIfPresent } from './validate-if-present.decorator';

/**
 * The decorator exists for one difference, so that is what is pinned: both
 * spellings skip an omitted field, and only `@IsOptional()` also waves `null`
 * through to a column that cannot hold it.
 */
class Subject {
  @ValidateIfPresent()
  @IsString()
  readonly required?: string;

  @IsOptional()
  @IsString()
  readonly nullable?: string | null;
}

describe('ValidateIfPresent', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = { type: 'body', metatype: Subject };

  const validate = (body: unknown): Promise<Subject> =>
    pipe.transform(body, metadata) as Promise<Subject>;

  it('skips the constraints for a field the body omitted', async () => {
    await expect(validate({})).resolves.toEqual({});
  });

  it('runs the constraints on a value that was sent', async () => {
    await expect(validate({ required: 'present' })).resolves.toMatchObject({
      required: 'present',
    });
  });

  it('rejects null, which is the whole point', async () => {
    await expect(validate({ required: null })).rejects.toThrow();
  });

  it('still rejects a value of the wrong type', async () => {
    await expect(validate({ required: 42 })).rejects.toThrow();
  });

  it('leaves @IsOptional() alone, so a nullable field can still be cleared', async () => {
    await expect(validate({ nullable: null })).resolves.toMatchObject({
      nullable: null,
    });
  });
});
