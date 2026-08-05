import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  LEAVE_BALANCE_GENERATION_MAX_IDS,
  LEAVE_BALANCE_MAX_YEAR,
  LEAVE_BALANCE_MIN_YEAR,
} from '../employee-leave-balance.constants';
import { GenerateLeaveBalancesDto } from './generate-leave-balances.dto';

/**
 * Run through a `ValidationPipe` configured exactly like the global one, so what
 * is asserted here is the object the service receives — transforms included.
 */
describe('GenerateLeaveBalancesDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: GenerateLeaveBalancesDto,
  };

  const validate = (body: unknown): Promise<GenerateLeaveBalancesDto> =>
    pipe.transform(body, metadata) as Promise<GenerateLeaveBalancesDto>;

  it('accepts a year on its own — the ordinary January call', async () => {
    const dto = await validate({ year: 2027 });

    expect(dto.year).toBe(2027);
    expect(dto.employeeIds).toBeUndefined();
    expect(dto.leaveTypeIds).toBeUndefined();
    expect(dto.dryRun).toBeUndefined();
  });

  it('requires the year', async () => {
    await expect(validate({})).rejects.toThrow();
  });

  it.each([LEAVE_BALANCE_MIN_YEAR - 1, LEAVE_BALANCE_MAX_YEAR + 1, 2026.5])(
    'rejects year %s',
    async (year) => {
      await expect(validate({ year })).rejects.toThrow();
    },
  );

  /**
   * The whole point of the feature: the number comes from the leave type, so
   * there is nothing here for a caller to state. `forbidNonWhitelisted` says so
   * rather than ignoring the attempt.
   */
  it.each(['allocatedDays', 'carriedOverDays', 'expiredDays'])(
    'rejects %s, which the leave type decides',
    async (field) => {
      await expect(validate({ year: 2027, [field]: 21 })).rejects.toThrow();
    },
  );

  describe('the narrowing lists', () => {
    it('accepts a single id, which is the new-hire call', async () => {
      const dto = await validate({ year: 2027, employeeIds: ['emp-1'] });

      expect(dto.employeeIds).toEqual(['emp-1']);
    });

    /**
     * An empty list is a caller asking for nobody, and stays distinguishable
     * from omitting the field, which asks for everybody. Collapsing the two
     * would let a filtered UI that matched nothing generate for the whole
     * company.
     */
    it('accepts an empty list as a real request', async () => {
      const dto = await validate({ year: 2027, employeeIds: [] });

      expect(dto.employeeIds).toEqual([]);
    });

    it('rejects a duplicated id rather than de-duplicating it', async () => {
      await expect(
        validate({ year: 2027, employeeIds: ['emp-1', 'emp-1'] }),
      ).rejects.toThrow();
    });

    it('rejects a list longer than the bound', async () => {
      const tooMany = Array.from(
        { length: LEAVE_BALANCE_GENERATION_MAX_IDS + 1 },
        (_, index) => `emp-${String(index)}`,
      );

      await expect(
        validate({ year: 2027, employeeIds: tooMany }),
      ).rejects.toThrow();
    });

    it.each([['  '], [''], [42]])('rejects %s as an id', async (id) => {
      await expect(
        validate({ year: 2027, leaveTypeIds: [id] }),
      ).rejects.toThrow();
    });

    it('trims the ids it accepts', async () => {
      const dto = await validate({ year: 2027, leaveTypeIds: ['  lvt-1  '] });

      expect(dto.leaveTypeIds).toEqual(['lvt-1']);
    });
  });

  describe('dryRun', () => {
    it('accepts true', async () => {
      await expect(
        validate({ year: 2027, dryRun: true }),
      ).resolves.toMatchObject({ dryRun: true });
    });

    /** A JSON body carries real booleans; `"true"` is a client that should fix it. */
    it.each(['true', 1, null])('rejects %s', async (dryRun) => {
      await expect(validate({ year: 2027, dryRun })).rejects.toThrow();
    });
  });
});
