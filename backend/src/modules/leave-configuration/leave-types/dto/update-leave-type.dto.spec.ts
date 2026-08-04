import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { UpdateLeaveTypeDto } from './update-leave-type.dto';

/**
 * The `PATCH` body, through a `ValidationPipe` configured like the global one.
 *
 * What these cases are really about is the difference between an omitted field
 * and an explicit `null`: the first means "leave it alone", the second means
 * "clear it" — and only the three nullable columns may be cleared.
 */
describe('UpdateLeaveTypeDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: UpdateLeaveTypeDto,
  };

  const validate = (body: unknown): Promise<UpdateLeaveTypeDto> =>
    pipe.transform(body, metadata) as Promise<UpdateLeaveTypeDto>;

  it('accepts an empty body', async () => {
    await expect(validate({})).resolves.toEqual({});
  });

  it('accepts a single field', async () => {
    const dto = await validate({ isActive: false });

    expect(dto.isActive).toBe(false);
    expect(dto.code).toBeUndefined();
  });

  it('normalises code and icon exactly as create does', async () => {
    const dto = await validate({ code: ' annual ', icon: ' Umbrella-Beach ' });

    expect(dto.code).toBe('ANNUAL');
    // Trimmed, and the case left alone: the icon set owns the spelling.
    expect(dto.icon).toBe('Umbrella-Beach');
  });

  it.each([
    ['color', { color: null }],
    ['description', { description: null }],
    ['defaultAllocatedDays', { defaultAllocatedDays: null }],
  ])('accepts null to clear %s', async (_field, body) => {
    await expect(validate(body)).resolves.toEqual(body);
  });

  /**
   * `@ValidateIfPresent()` rather than `@IsOptional()` on the required columns:
   * `null` is not a value they can hold, so it is a 400 naming the field rather
   * than a driver error the client cannot act on.
   */
  it.each([
    ['code', { code: null }],
    ['label', { label: null }],
    ['icon', { icon: null }],
    ['requiresApproval', { requiresApproval: null }],
    ['isPaid', { isPaid: null }],
    ['isActive', { isActive: null }],
  ])('rejects null for the required field %s', async (_field, body) => {
    await expect(validate(body)).rejects.toThrow();
  });

  it('rejects a blank icon, as create does', async () => {
    await expect(validate({ icon: '   ' })).rejects.toThrow();
  });

  it('rejects an unknown property', async () => {
    await expect(validate({ maxConsecutiveDays: 5 })).rejects.toThrow();
  });
});
