import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  EmployeeStatus,
  SeniorityLevel,
  UserRole,
} from '../../../generated/prisma/enums';
import { CreateUserDto } from '../../users/dto/create-user.dto';
import {
  EMPLOYEE_CODE_MAX_LENGTH,
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

  it('accepts a payload without the defaulted field', async () => {
    const dto = await validate(VALID);

    expect(dto.employeeCode).toBe('EMP-0001');
    expect(dto.canReplaceOthers).toBeUndefined();
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
    ['a missing department id', 'departmentId'],
    ['a missing position id', 'positionId'],
    ['a missing seniority', 'seniority'],
    ['a missing status', 'status'],
  ])('rejects %s', async (_case, field) => {
    const { [field as keyof typeof VALID]: _removed, ...body } = VALID;

    await expect(validate(body)).rejects.toThrow();
  });

  /**
   * The account opt-in, added by Feature 036.
   *
   * `userId` became optional here, and that is **not** a loosening: exactly one
   * of `userId` and `account` must be given, and a body carrying neither or both
   * is refused by `EmployeeService`. The rule lives there because it is about two
   * fields at once, which class-validator judges one property at a time — so this
   * spec deliberately accepts a body with neither and the service spec is where
   * the pair rule is asserted.
   */
  describe('the account opt-in', () => {
    const ACCOUNT = { email: 'ion.popescu@example.com', role: UserRole.USER };

    it('accepts a nested account instead of a userId', async () => {
      const { userId: _userId, ...body } = VALID;
      const dto = await validate({ ...body, account: ACCOUNT });

      expect(dto.account).toBeInstanceOf(CreateUserDto);
      expect(dto.account?.email).toBe('ion.popescu@example.com');
    });

    /**
     * The nested object is validated by `CreateUserDto`'s own rules, which is
     * the whole point of reusing the class: an account created here and one
     * created through `POST /users` cannot acquire different validation.
     *
     * The `password` case is the one that matters — it is the field 036 removed,
     * and it must be refused *inside* the nesting too, not only at the top level.
     */
    it.each([
      ['a malformed email', { ...ACCOUNT, email: 'not-an-email' }],
      ['a missing email', { role: UserRole.USER }],
      ['a missing role', { email: 'ion.popescu@example.com' }],
      ['a role outside the enum', { ...ACCOUNT, role: 'ROOT' }],
      ['a smuggled password', { ...ACCOUNT, password: 'chosen for them' }],
      ['an unknown property', { ...ACCOUNT, nickname: 'Ionut' }],
    ])('rejects %s inside the nested account', async (_case, account) => {
      const { userId: _userId, ...body } = VALID;

      await expect(validate({ ...body, account })).rejects.toThrow();
    });

    /** Normalisation descends too: the address is folded exactly as elsewhere. */
    it('lower-cases and trims the nested email', async () => {
      const { userId: _userId, ...body } = VALID;
      const dto = await validate({
        ...body,
        account: { ...ACCOUNT, email: '  Ion.Popescu@Example.COM  ' },
      });

      expect(dto.account?.email).toBe('ion.popescu@example.com');
    });
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
    ['an unknown property', { ...VALID, salary: 5000 }],
    ['a null department id', { ...VALID, departmentId: null }],
    ['a null canReplaceOthers', { ...VALID, canReplaceOthers: null }],
  ])('rejects %s', async (_case, body) => {
    await expect(validate(body)).rejects.toThrow();
  });

  /**
   * Feature 022 moved leave out of this resource entirely: entitlement is a row
   * per leave type per year in `employee_leave_balances`, so creating an
   * employee grants nothing and the old field is now simply unknown here.
   */
  it('rejects a vacation entitlement, which this resource no longer has', async () => {
    await expect(validate({ ...VALID, maxVacationDays: 21 })).rejects.toThrow();
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
