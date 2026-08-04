import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { EmployeeStatus } from '../../../generated/prisma/enums';
import { UpdateEmployeeDto } from './update-employee.dto';

/**
 * Only what differs from creation is asserted here — the shared constraints are
 * the same composed decorators, already covered by `create-employee.dto.spec`.
 * What is specific to a patch is that everything may be omitted, and that
 * omitting a field is not the same request as clearing it.
 */
describe('UpdateEmployeeDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: UpdateEmployeeDto,
  };

  const validate = (body: unknown): Promise<UpdateEmployeeDto> =>
    pipe.transform(body, metadata) as Promise<UpdateEmployeeDto>;

  it('accepts an empty body', async () => {
    await expect(validate({})).resolves.toEqual({});
  });

  it('accepts a single field', async () => {
    const dto = await validate({ status: EmployeeStatus.ON_LEAVE });

    expect(dto.status).toBe(EmployeeStatus.ON_LEAVE);
    expect(dto.firstName).toBeUndefined();
  });

  it('accepts an explicit null phone, which is how one is removed', async () => {
    const dto = await validate({ phone: null });

    expect(dto.phone).toBeNull();
  });

  it('turns a blank phone into null too', async () => {
    const dto = await validate({ phone: '  ' });

    expect(dto.phone).toBeNull();
  });

  it('still normalises the employee code', async () => {
    const dto = await validate({ employeeCode: ' emp-0002 ' });

    expect(dto.employeeCode).toBe('EMP-0002');
  });

  it('accepts a new department, which the service then has to confirm', async () => {
    const dto = await validate({ departmentId: 'dep-2' });

    expect(dto.departmentId).toBe('dep-2');
  });

  /**
   * `null` is a value only where the column is nullable. Everywhere else it is
   * a `400` rather than something `@IsOptional()` waves through to a column
   * that cannot store it — which is what `@ValidateIfPresent()` is for.
   */
  it.each([
    ['a null user id', { userId: null }],
    ['a null department id', { departmentId: null }],
    ['a null position id', { positionId: null }],
    ['a null employee code', { employeeCode: null }],
    ['a null first name', { firstName: null }],
    ['a null hire date', { hireDate: null }],
    ['a null seniority', { seniority: null }],
    ['a null status', { status: null }],
    ['a null canReplaceOthers', { canReplaceOthers: null }],
  ])('rejects %s, since the column is not nullable', async (_case, body) => {
    await expect(validate(body)).rejects.toThrow();
  });

  it.each([
    ['a blank position id', { positionId: '   ' }],
    ['a hire date that is not a date', { hireDate: 'yesterday' }],
    ['a status outside the enum', { status: 'RETIRED' }],
    // `maxVacationDays` went with its column in Feature 022; sending it is now
    // an unknown property, which is a 400 for a different reason than before.
    [
      'a vacation entitlement, which this resource no longer has',
      { maxVacationDays: 21 },
    ],
    ['an unknown property', { salary: 5000 }],
  ])('rejects %s', async (_case, body) => {
    await expect(validate(body)).rejects.toThrow();
  });
});
