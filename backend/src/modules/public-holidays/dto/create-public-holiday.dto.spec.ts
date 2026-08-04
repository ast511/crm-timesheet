import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  PUBLIC_HOLIDAY_DESCRIPTION_MAX_LENGTH,
  PUBLIC_HOLIDAY_NAME_MAX_LENGTH,
} from '../public-holiday.constants';
import { CreatePublicHolidayDto } from './create-public-holiday.dto';

/**
 * Run through a `ValidationPipe` configured exactly like the global one, so
 * what is asserted here is the object the controller receives — transforms
 * included.
 *
 * Only the shape of one field at a time is checked here. The rules that need
 * two fields — the ordered span, the recurrence flag, the duplicate rules — are
 * the service's, and are asserted in its own spec.
 */
describe('CreatePublicHolidayDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreatePublicHolidayDto,
  };

  const validate = (body: unknown): Promise<CreatePublicHolidayDto> =>
    pipe.transform(body, metadata) as Promise<CreatePublicHolidayDto>;

  const FIXED = {
    name: 'Christmas Day',
    type: 'FIXED',
    startDate: '2025-12-25',
    endDate: '2025-12-26',
  };

  it('accepts the four required fields on their own', async () => {
    const dto = await validate(FIXED);

    expect(dto.name).toBe('Christmas Day');
    expect(dto.type).toBe('FIXED');
    expect(dto.startDate).toBe('2025-12-25');
    expect(dto.endDate).toBe('2025-12-26');
  });

  it('leaves the defaulted fields absent so the schema supplies them', async () => {
    const dto = await validate(FIXED);

    expect(dto.isNational).toBeUndefined();
    expect(dto.isRecurring).toBeUndefined();
  });

  /** Omitting the range is the common case: always applied, still does. */
  it('leaves the validity range absent when the body omits it', async () => {
    const dto = await validate(FIXED);

    expect(dto.validFromYear).toBeUndefined();
    expect(dto.validToYear).toBeUndefined();
  });

  it('accepts a validity range on a fixed holiday', async () => {
    const dto = await validate({
      ...FIXED,
      validFromYear: 2020,
      validToYear: 2026,
    });

    expect(dto.validFromYear).toBe(2020);
    expect(dto.validToYear).toBe(2026);
  });

  it('trims the name but keeps its case and diacritics', async () => {
    const dto = await validate({ ...FIXED, name: '  Ziua Națională  ' });

    expect(dto.name).toBe('Ziua Națională');
  });

  it('turns a blank description into null', async () => {
    const dto = await validate({ ...FIXED, description: '   ' });

    expect(dto.description).toBeNull();
  });

  it('accepts a full ISO timestamp as well as a plain date', async () => {
    const dto = await validate({
      ...FIXED,
      startDate: '2025-12-25T00:00:00.000Z',
    });

    expect(dto.startDate).toBe('2025-12-25T00:00:00.000Z');
  });

  it.each([
    ['a missing name', { ...FIXED, name: undefined }],
    ['a blank name', { ...FIXED, name: '   ' }],
    ['a missing type', { ...FIXED, type: undefined }],
    ['a type outside the enum', { ...FIXED, type: 'MOVEABLE' }],
    ['the stored spelling of a type', { ...FIXED, type: 'fixed' }],
    ['a missing startDate', { ...FIXED, startDate: undefined }],
    ['a missing endDate', { ...FIXED, endDate: undefined }],
    ['an ambiguous date format', { ...FIXED, startDate: '25/12/2025' }],
    ['a date that is not one', { ...FIXED, startDate: 'Christmas' }],
    ['a null startDate', { ...FIXED, startDate: null }],
    ['a non-boolean isNational', { ...FIXED, isNational: 'yes' }],
    ['a non-boolean isRecurring', { ...FIXED, isRecurring: 'true' }],
    ['the removed isActive flag', { ...FIXED, isActive: false }],
    ['a validity year as a string', { ...FIXED, validFromYear: '2020' }],
    ['a fractional validity year', { ...FIXED, validToYear: 2026.5 }],
    ['a validity year below the minimum', { ...FIXED, validFromYear: 1969 }],
    ['a validity year above the maximum', { ...FIXED, validToYear: 2101 }],
    ['an unknown property', { ...FIXED, year: 2025 }],
  ])('rejects %s', async (_case, body) => {
    await expect(validate(body)).rejects.toThrow();
  });

  it.each([
    ['name', PUBLIC_HOLIDAY_NAME_MAX_LENGTH],
    ['description', PUBLIC_HOLIDAY_DESCRIPTION_MAX_LENGTH],
  ])('rejects a %s above its maximum length', async (field, maxLength) => {
    await expect(
      validate({ ...FIXED, [field]: 'A'.repeat(maxLength + 1) }),
    ).rejects.toThrow();
  });
});
