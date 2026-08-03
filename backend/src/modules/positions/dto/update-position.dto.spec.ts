import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { UpdatePositionDto } from './update-position.dto';

/**
 * Only the differences from `CreatePositionDto` are asserted here — the shared
 * constraints are covered by that spec, because both DTOs apply the very same
 * decorators.
 */
describe('UpdatePositionDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: UpdatePositionDto,
  };

  const validate = (body: unknown): Promise<UpdatePositionDto> =>
    pipe.transform(body, metadata) as Promise<UpdatePositionDto>;

  it('accepts an empty body', async () => {
    await expect(validate({})).resolves.toBeDefined();
  });

  it('accepts a single field on its own', async () => {
    const dto = await validate({ isActive: false });

    expect(dto.isActive).toBe(false);
    expect(dto.code).toBeUndefined();
    expect(dto.name).toBeUndefined();
  });

  it('normalises a code exactly as creation does', async () => {
    const dto = await validate({ code: ' dev ' });

    expect(dto.code).toBe('DEV');
  });

  it('accepts an explicit null description as "clear it"', async () => {
    const dto = await validate({ description: null });

    expect(dto.description).toBeNull();
  });

  it('still rejects a blank name rather than treating it as absent', async () => {
    await expect(validate({ name: '   ' })).rejects.toThrow();
  });

  it('still rejects an unknown property', async () => {
    await expect(validate({ colour: 'red' })).rejects.toThrow();
  });
});
