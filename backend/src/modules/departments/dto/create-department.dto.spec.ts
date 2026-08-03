import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  DEPARTMENT_CODE_MAX_LENGTH,
  DEPARTMENT_DESCRIPTION_MAX_LENGTH,
  DEPARTMENT_NAME_MAX_LENGTH,
} from '../department.constants';
import { CreateDepartmentDto } from './create-department.dto';

/**
 * Run through a `ValidationPipe` configured exactly like the global one, so
 * what is asserted here is the object the controller receives — transforms
 * included, since normalising `code` before the uniqueness check is what makes
 * the database's unique index authoritative.
 */
describe('CreateDepartmentDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateDepartmentDto,
  };

  const validate = (body: unknown): Promise<CreateDepartmentDto> =>
    pipe.transform(body, metadata) as Promise<CreateDepartmentDto>;

  it('accepts a payload with only code and name', async () => {
    const dto = await validate({ code: 'DEV', name: 'Development' });

    expect(dto.code).toBe('DEV');
    expect(dto.name).toBe('Development');
  });

  it('trims and upper-cases the code', async () => {
    const dto = await validate({ code: '  dev  ', name: 'Development' });

    expect(dto.code).toBe('DEV');
  });

  it('trims the name but keeps its case', async () => {
    const dto = await validate({ code: 'DEV', name: '  Development  ' });

    expect(dto.name).toBe('Development');
  });

  it('turns a blank description into null', async () => {
    const dto = await validate({
      code: 'DEV',
      name: 'Development',
      description: '   ',
    });

    expect(dto.description).toBeNull();
  });

  it('trims a description that has content', async () => {
    const dto = await validate({
      code: 'DEV',
      name: 'Development',
      description: '  Writes software.  ',
    });

    expect(dto.description).toBe('Writes software.');
  });

  it.each([
    ['a missing code', { name: 'Development' }],
    ['a missing name', { code: 'DEV' }],
    ['a blank code', { code: '   ', name: 'Development' }],
    ['a blank name', { code: 'DEV', name: '   ' }],
    ['a code containing a space', { code: 'DEV OPS', name: 'Development' }],
    ['a code containing punctuation', { code: 'DEV.OPS', name: 'Development' }],
    ['a code that is only separators', { code: '--', name: 'Development' }],
    ['a non-string name', { code: 'DEV', name: 42 }],
    ['a non-boolean isActive', { code: 'DEV', name: 'Dev', isActive: 'yes' }],
    ['an unknown property', { code: 'DEV', name: 'Dev', colour: 'red' }],
  ])('rejects %s', async (_case, body) => {
    await expect(validate(body)).rejects.toThrow();
  });

  it.each([
    ['code', DEPARTMENT_CODE_MAX_LENGTH],
    ['name', DEPARTMENT_NAME_MAX_LENGTH],
    ['description', DEPARTMENT_DESCRIPTION_MAX_LENGTH],
  ])('rejects a %s above its maximum length', async (field, maxLength) => {
    const body = {
      code: 'DEV',
      name: 'Development',
      [field]: 'A'.repeat(maxLength + 1),
    };

    await expect(validate(body)).rejects.toThrow();
  });

  it('accepts separators inside the code', async () => {
    const dto = await validate({ code: 'dev-ops_2', name: 'DevOps' });

    expect(dto.code).toBe('DEV-OPS_2');
  });
});
