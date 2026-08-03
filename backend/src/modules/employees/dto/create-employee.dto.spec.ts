import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  EmployeeStatus,
  SeniorityLevel,
} from '../../../generated/prisma/enums';
import {
  EMPLOYEE_CODE_MAX_LENGTH,
  EMPLOYEE_MAX_VACATION_DAYS,
  EMPLOYEE_MIN_VACATION_DAYS,
  EMPLOYEE_NAME_MAX_LENGTH,
  EMPLOYEE_PHONE_MAX_LENGTH,
} from '../employee.constants';
import { CreateEmployeeDto } from './create-employee.dto';

/**
 * Run through a `ValidationPipe` configured exactly like the global one, so
 * what is asserted here is the object the service receives — transforms
 * included, since upper-casing `employeeCode` before the uniqueness check is
 * what makes the database's unique index authoritative.
 */
describe('CreateEmployeeDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateEmployeeDto,
  };

  const validate = (body: unknown): Promise<CreateEmployeeDto> =>
    pipe.transform(body, metadata) as Promise<CreateEmployeeDto>;

  const VALID = {
    employeeCode: 'EMP-0001',
    firstName: 'Ion',
    lastName: 'Popescu',
    hireDate: '2020-01-13',
    userId: 'usr-1',
    departmentId: 'dep-1',
    positionId: 'pos-1',
    seniority: SeniorityLevel.SENIOR,
    status: EmployeeStatus.ACTIVE,
  };

  it('accepts a payload without the two defaulted fields', async () => {
    const dto = await validate(VALID);

    expect(dto.employeeCode).toBe('EMP-0001');
    expect(dto.canReplaceOthers).toBeUndefined();
    expect(dto.maxVacationDays).toBeUndefined();
    expect(dto.phone).toBeUndefined();
  });

  it('trims and upper-cases the employee code', async () => {
    const dto = await validate({ ...VALID, employeeCode: '  emp-0001  ' });

    expect(dto.employeeCode).toBe('EMP-0001');
  });

  it('trims the names but keeps their case and diacritics', async () => {
    const dto = await validate({
      ...VALID,
      firstName: '  Ștefan  ',
      lastName: '  Popescu-Ionescu  ',
    });

    expect(dto.firstName).toBe('Ștefan');
    expect(dto.lastName).toBe('Popescu-Ionescu');
  });

  it('keeps a phone number as typed, separators included', async () => {
    const dto = await validate({ ...VALID, phone: '  +40 722 123 456  ' });

    expect(dto.phone).toBe('+40 722 123 456');
  });

  it('turns a blank phone into null', async () => {
    const dto = await validate({ ...VALID, phone: '   ' });

    expect(dto.phone).toBeNull();
  });

  it('keeps the hire date as the ISO string the service parses', async () => {
    const dto = await validate({ ...VALID, hireDate: '2020-01-13' });

    expect(dto.hireDate).toBe('2020-01-13');
  });

  it('accepts a full ISO timestamp as the hire date', async () => {
    const dto = await validate({
      ...VALID,
      hireDate: '2020-01-13T00:00:00.000Z',
    });

    expect(dto.hireDate).toBe('2020-01-13T00:00:00.000Z');
  });

  it.each(Object.values(SeniorityLevel))(
    'accepts the seniority %s',
    async (seniority) => {
      const dto = await validate({ ...VALID, seniority });

      expect(dto.seniority).toBe(seniority);
    },
  );

  it.each(Object.values(EmployeeStatus))(
    'accepts the status %s',
    async (status) => {
      const dto = await validate({ ...VALID, status });

      expect(dto.status).toBe(status);
    },
  );

  it.each([
    ['a missing employee code', 'employeeCode'],
    ['a missing first name', 'firstName'],
    ['a missing last name', 'lastName'],
    ['a missing hire date', 'hireDate'],
    ['a missing user id', 'userId'],
    ['a missing department id', 'departmentId'],
    ['a missing position id', 'positionId'],
    ['a missing seniority', 'seniority'],
    ['a missing status', 'status'],
  ])('rejects %s', async (_case, field) => {
    const { [field as keyof typeof VALID]: _removed, ...body } = VALID;

    await expect(validate(body)).rejects.toThrow();
  });

  it.each([
    ['a code with a space', { ...VALID, employeeCode: 'EMP 0001' }],
    ['a code with punctuation', { ...VALID, employeeCode: 'EMP#1' }],
    ['a blank first name', { ...VALID, firstName: '   ' }],
    ['a blank last name', { ...VALID, lastName: '   ' }],
    ['a blank user id', { ...VALID, userId: '   ' }],
    ['a hire date that is not a date', { ...VALID, hireDate: 'yesterday' }],
    ['a hire date in a national format', { ...VALID, hireDate: '13/01/2020' }],
    ['a seniority outside the enum', { ...VALID, seniority: 'PRINCIPAL' }],
    ['a lower-cased seniority', { ...VALID, seniority: 'senior' }],
    ['a status outside the enum', { ...VALID, status: 'RETIRED' }],
    ['a non-boolean canReplaceOthers', { ...VALID, canReplaceOthers: 'yes' }],
    ['a non-integer maxVacationDays', { ...VALID, maxVacationDays: 21.5 }],
    ['maxVacationDays as a string', { ...VALID, maxVacationDays: '21' }],
    ['an unknown property', { ...VALID, salary: 5000 }],
    ['a null department id', { ...VALID, departmentId: null }],
    ['a null canReplaceOthers', { ...VALID, canReplaceOthers: null }],
    ['a null maxVacationDays', { ...VALID, maxVacationDays: null }],
  ])('rejects %s', async (_case, body) => {
    await expect(validate(body)).rejects.toThrow();
  });

  it('rejects a vacation entitlement of zero days', async () => {
    await expect(
      validate({ ...VALID, maxVacationDays: EMPLOYEE_MIN_VACATION_DAYS - 1 }),
    ).rejects.toThrow();
  });

  it('rejects a vacation entitlement above a year', async () => {
    await expect(
      validate({ ...VALID, maxVacationDays: EMPLOYEE_MAX_VACATION_DAYS + 1 }),
    ).rejects.toThrow();
  });

  it.each([
    ['employeeCode', EMPLOYEE_CODE_MAX_LENGTH],
    ['firstName', EMPLOYEE_NAME_MAX_LENGTH],
    ['lastName', EMPLOYEE_NAME_MAX_LENGTH],
    ['phone', EMPLOYEE_PHONE_MAX_LENGTH],
  ])('rejects a %s above its maximum length', async (field, maxLength) => {
    await expect(
      validate({ ...VALID, [field]: 'A'.repeat(maxLength + 1) }),
    ).rejects.toThrow();
  });
});
