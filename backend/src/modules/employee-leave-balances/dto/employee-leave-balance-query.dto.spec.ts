import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { SortOrder } from '../../../common/enums/sort-order.enum';
import {
  LEAVE_BALANCE_MAX_YEAR,
  LEAVE_BALANCE_MIN_YEAR,
} from '../employee-leave-balance.constants';
import { EmployeeLeaveBalanceQueryDto } from './employee-leave-balance-query.dto';

/**
 * The list endpoint's query string, through a `ValidationPipe` configured like
 * the global one.
 *
 * A query parameter is always text, so `?year=` has to be coerced — the opposite
 * of the body DTO, where `"2026"` is a payload the client should fix.
 */
describe('EmployeeLeaveBalanceQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: EmployeeLeaveBalanceQueryDto,
  };

  const validate = (query: unknown): Promise<EmployeeLeaveBalanceQueryDto> =>
    pipe.transform(query, metadata) as Promise<EmployeeLeaveBalanceQueryDto>;

  it('applies the shared defaults and this module’s own sort field', async () => {
    const dto = await validate({});

    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.sortBy).toBe('employee');
    expect(dto.sortOrder).toBe(SortOrder.ASC);
  });

  it.each(['employee', 'year', 'allocatedDays', 'usedDays', 'createdAt'])(
    'accepts %s as a sort field',
    async (sortBy) => {
      const dto = await validate({ sortBy });

      expect(dto.sortBy).toBe(sortBy);
    },
  );

  /**
   * `remainingDays` is computed, so there is no column for `orderBy` to name.
   * Rejecting it is better than sorting one already-chosen page by it.
   */
  it('rejects remainingDays as a sort field', async () => {
    await expect(validate({ sortBy: 'remainingDays' })).rejects.toThrow();
  });

  it.each(['notes', 'employeeId', 'id; DROP TABLE'])(
    'rejects %s as a sort field',
    async (sortBy) => {
      await expect(validate({ sortBy })).rejects.toThrow();
    },
  );

  it('coerces the year from the query string', async () => {
    const dto = await validate({ year: '2026' });

    expect(dto.year).toBe(2026);
  });

  it.each([
    ['a year below the minimum', String(LEAVE_BALANCE_MIN_YEAR - 1)],
    ['a year above the maximum', String(LEAVE_BALANCE_MAX_YEAR + 1)],
    ['a year that is not a number', 'last'],
    ['a fractional year', '2026.5'],
  ])('rejects %s', async (_case, year) => {
    await expect(validate({ year })).rejects.toThrow();
  });

  /**
   * Absent means "every year". Defaulting to the current one would silently
   * narrow a request for everything, with no parameter meaning "all".
   */
  it('leaves an unstated filter undefined rather than defaulting it', async () => {
    const dto = await validate({});

    expect(dto.year).toBeUndefined();
    expect(dto.leaveTypeId).toBeUndefined();
    expect(dto.departmentId).toBeUndefined();
  });

  it('trims the search term', async () => {
    const dto = await validate({ search: '  popescu  ' });

    expect(dto.search).toBe('popescu');
  });

  it('accepts the two relation filters as plain ids', async () => {
    const dto = await validate({ leaveTypeId: 'lvt-1', departmentId: 'dep-1' });

    expect(dto.leaveTypeId).toBe('lvt-1');
    expect(dto.departmentId).toBe('dep-1');
  });

  it('rejects an unknown parameter', async () => {
    await expect(validate({ employeeId: 'emp-1' })).rejects.toThrow();
  });
});
