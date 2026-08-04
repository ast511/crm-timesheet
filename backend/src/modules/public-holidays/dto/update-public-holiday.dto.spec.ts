import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { UpdatePublicHolidayDto } from './update-public-holiday.dto';

/**
 * What matters here is which fields accept `null` and which do not:
 * `description` is the only nullable column, so it is the only field where
 * `null` is a request rather than a mistake.
 */
describe('UpdatePublicHolidayDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: UpdatePublicHolidayDto,
  };

  const validate = (body: unknown): Promise<UpdatePublicHolidayDto> =>
    pipe.transform(body, metadata) as Promise<UpdatePublicHolidayDto>;

  it('accepts an empty body', async () => {
    await expect(validate({})).resolves.toEqual({});
  });

  /** The rule the feature states: a repealed holiday is closed off at a year. */
  it('accepts validToYear on its own', async () => {
    const dto = await validate({ validToYear: 2026 });

    expect(dto.validToYear).toBe(2026);
  });

  it('re-opens an end of the range with null', async () => {
    const dto = await validate({ validToYear: null });

    expect(dto.validToYear).toBeNull();
  });

  it('accepts one end of the span on its own', async () => {
    const dto = await validate({ endDate: '2026-04-13' });

    expect(dto.endDate).toBe('2026-04-13');
  });

  it('clears the description with null', async () => {
    const dto = await validate({ description: null });

    expect(dto.description).toBeNull();
  });

  it('clears the description with a blank string too', async () => {
    const dto = await validate({ description: '  ' });

    expect(dto.description).toBeNull();
  });

  it('accepts a change of type', async () => {
    const dto = await validate({ type: 'VARIABLE' });

    expect(dto.type).toBe('VARIABLE');
  });

  it.each([
    ['a null name', { name: null }],
    ['a blank name', { name: '   ' }],
    ['a null type', { type: null }],
    ['a type outside the enum', { type: 'MOVEABLE' }],
    ['a null startDate', { startDate: null }],
    ['the removed isActive flag', { isActive: false }],
    ['a null isNational', { isNational: null }],
    ['a validity year as a string', { validFromYear: '2020' }],
    ['a validity year out of range', { validToYear: 2101 }],
    ['a null isRecurring', { isRecurring: null }],
    ['a date that is not one', { endDate: 'Easter' }],
    ['an unknown property', { year: 2026 }],
  ])('rejects %s', async (_case, body) => {
    await expect(validate(body)).rejects.toThrow();
  });
});
