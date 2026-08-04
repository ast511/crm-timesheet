import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  LEAVE_BALANCE_MAX_DAYS,
  LEAVE_BALANCE_MAX_YEAR,
  LEAVE_BALANCE_MIN_YEAR,
  LEAVE_BALANCE_NOTES_MAX_LENGTH,
} from '../employee-leave-balance.constants';
import { CreateEmployeeLeaveBalanceDto } from './create-employee-leave-balance.dto';

/**
 * Run through a `ValidationPipe` configured exactly like the global one, so what
 * is asserted here is the object the service receives — transforms included.
 */
describe('CreateEmployeeLeaveBalanceDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateEmployeeLeaveBalanceDto,
  };

  const validate = (body: unknown): Promise<CreateEmployeeLeaveBalanceDto> =>
    pipe.transform(body, metadata) as Promise<CreateEmployeeLeaveBalanceDto>;

  const VALID = {
    employeeId: 'emp-1',
    leaveTypeId: 'lvt-1',
    year: 2026,
    allocatedDays: 21,
  };

  it('accepts the four required fields alone', async () => {
    const dto = await validate(VALID);

    expect(dto.employeeId).toBe('emp-1');
    expect(dto.year).toBe(2026);
    expect(dto.allocatedDays).toBe(21);
    expect(dto.carriedOverDays).toBeUndefined();
    expect(dto.usedDays).toBeUndefined();
  });

  /**
   * The one rule this DTO exists to enforce as loudly as possible: the derived
   * value is not something a client may state.
   */
  it('rejects remainingDays, which is computed and never stored', async () => {
    await expect(validate({ ...VALID, remainingDays: 21 })).rejects.toThrow();
  });

  it.each([
    ['employeeId', 'employeeId'],
    ['leaveTypeId', 'leaveTypeId'],
    ['year', 'year'],
    ['allocatedDays', 'allocatedDays'],
  ])('rejects a missing %s', async (_case, field) => {
    const { [field as keyof typeof VALID]: _removed, ...body } = VALID;

    await expect(validate(body)).rejects.toThrow();
  });

  /** `0` is a decision — "no days of this type this year" — not an omission. */
  it.each(['allocatedDays', 'carriedOverDays', 'usedDays'])(
    'accepts zero for %s',
    async (field) => {
      const dto = (await validate({
        ...VALID,
        [field]: 0,
      })) as unknown as Record<string, unknown>;

      expect(dto[field]).toBe(0);
    },
  );

  it.each(['allocatedDays', 'carriedOverDays', 'usedDays'])(
    'rejects a negative %s',
    async (field) => {
      await expect(validate({ ...VALID, [field]: -1 })).rejects.toThrow();
    },
  );

  it.each(['allocatedDays', 'carriedOverDays', 'usedDays'])(
    'rejects a %s above a leap year',
    async (field) => {
      await expect(
        validate({ ...VALID, [field]: LEAVE_BALANCE_MAX_DAYS + 1 }),
      ).rejects.toThrow();
    },
  );

  /** Whole days only; the `integer` column would silently truncate the rest. */
  it.each(['allocatedDays', 'carriedOverDays', 'usedDays'])(
    'rejects a fractional %s',
    async (field) => {
      await expect(validate({ ...VALID, [field]: 10.5 })).rejects.toThrow();
    },
  );

  /** A JSON body distinguishes `21` from `"21"`; only a query string cannot. */
  it.each(['year', 'allocatedDays'])(
    'rejects %s sent as a string',
    async (field) => {
      await expect(validate({ ...VALID, [field]: '21' })).rejects.toThrow();
    },
  );

  it.each([
    ['a year below the minimum', LEAVE_BALANCE_MIN_YEAR - 1],
    ['a year above the maximum', LEAVE_BALANCE_MAX_YEAR + 1],
    ['a two-digit year', 26],
    ['a fractional year', 2026.5],
  ])('rejects %s', async (_case, year) => {
    await expect(validate({ ...VALID, year })).rejects.toThrow();
  });

  it('accepts the boundary years', async () => {
    await expect(
      validate({ ...VALID, year: LEAVE_BALANCE_MIN_YEAR }),
    ).resolves.toMatchObject({ year: LEAVE_BALANCE_MIN_YEAR });
    await expect(
      validate({ ...VALID, year: LEAVE_BALANCE_MAX_YEAR }),
    ).resolves.toMatchObject({ year: LEAVE_BALANCE_MAX_YEAR });
  });

  it('trims a note that has content', async () => {
    const dto = await validate({ ...VALID, notes: '  Agreed with HR.  ' });

    expect(dto.notes).toBe('Agreed with HR.');
  });

  it('turns a blank note into null', async () => {
    const dto = await validate({ ...VALID, notes: '   ' });

    expect(dto.notes).toBeNull();
  });

  it('rejects a note above its maximum length', async () => {
    await expect(
      validate({
        ...VALID,
        notes: 'x'.repeat(LEAVE_BALANCE_NOTES_MAX_LENGTH + 1),
      }),
    ).rejects.toThrow();
  });

  it.each([
    ['a blank employee id', { ...VALID, employeeId: '   ' }],
    ['a null leave type id', { ...VALID, leaveTypeId: null }],
    ['an unknown property', { ...VALID, approved: true }],
  ])('rejects %s', async (_case, body) => {
    await expect(validate(body)).rejects.toThrow();
  });
});
