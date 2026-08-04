import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { UpdateEmployeeLeaveBalanceDto } from './update-employee-leave-balance.dto';

/**
 * The `PATCH` body, through a `ValidationPipe` configured like the global one.
 *
 * Two things are worth asserting here above all: that the identifying triple
 * cannot be sent, and that `remainingDays` cannot either.
 */
describe('UpdateEmployeeLeaveBalanceDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: UpdateEmployeeLeaveBalanceDto,
  };

  const validate = (body: unknown): Promise<UpdateEmployeeLeaveBalanceDto> =>
    pipe.transform(body, metadata) as Promise<UpdateEmployeeLeaveBalanceDto>;

  it('accepts an empty body', async () => {
    await expect(validate({})).resolves.toEqual({});
  });

  it('accepts a single day count', async () => {
    const dto = await validate({ usedDays: 7 });

    expect(dto.usedDays).toBe(7);
    expect(dto.allocatedDays).toBeUndefined();
  });

  it('rejects remainingDays, which is computed and never stored', async () => {
    await expect(validate({ remainingDays: 12 })).rejects.toThrow();
  });

  /**
   * The triple is the balance's identity rather than three editable fields:
   * moving it would not edit this balance but claim it was always another one.
   * A misfiled balance is deleted and recreated.
   */
  it.each(['employeeId', 'leaveTypeId', 'year'])(
    'rejects %s, which identifies the balance rather than describing it',
    async (field) => {
      await expect(validate({ [field]: 'x' })).rejects.toThrow();
    },
  );

  it.each(['allocatedDays', 'carriedOverDays', 'usedDays'])(
    'accepts zero for %s',
    async (field) => {
      const dto = (await validate({ [field]: 0 })) as unknown as Record<
        string,
        unknown
      >;

      expect(dto[field]).toBe(0);
    },
  );

  it.each(['allocatedDays', 'carriedOverDays', 'usedDays'])(
    'rejects a negative %s',
    async (field) => {
      await expect(validate({ [field]: -1 })).rejects.toThrow();
    },
  );

  /** `@ValidateIfPresent()`: the columns are NOT NULL, so `null` is a 400. */
  it.each(['allocatedDays', 'carriedOverDays', 'usedDays'])(
    'rejects null for the non-nullable %s',
    async (field) => {
      await expect(validate({ [field]: null })).rejects.toThrow();
    },
  );

  it('accepts null to clear the note', async () => {
    await expect(validate({ notes: null })).resolves.toEqual({ notes: null });
  });

  it('turns a blank note into null', async () => {
    const dto = await validate({ notes: '   ' });

    expect(dto.notes).toBeNull();
  });
});
