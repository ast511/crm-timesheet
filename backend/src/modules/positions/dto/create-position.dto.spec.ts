import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  POSITION_CODE_MAX_LENGTH,
  POSITION_DESCRIPTION_MAX_LENGTH,
  POSITION_NAME_MAX_LENGTH,
} from '../position.constants';
import { CreatePositionDto } from './create-position.dto';

/**
 * Run through a `ValidationPipe` configured exactly like the global one, so
 * what is asserted here is the object the controller receives — transforms
 * included, since normalising `code` before the uniqueness check is what makes
 * the database's unique index authoritative.
 */
describe('CreatePositionDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreatePositionDto,
  };

  const validate = (body: unknown): Promise<CreatePositionDto> =>
    pipe.transform(body, metadata) as Promise<CreatePositionDto>;

  it('accepts a payload with only code and name', async () => {
    const dto = await validate({ code: 'DEV', name: 'Developer' });

    expect(dto.code).toBe('DEV');
    expect(dto.name).toBe('Developer');
  });

  it('trims and upper-cases the code', async () => {
    const dto = await validate({ code: '  dev  ', name: 'Developer' });

    expect(dto.code).toBe('DEV');
  });

  it('trims the name but keeps its case', async () => {
    const dto = await validate({ code: 'DEV', name: '  Developer  ' });

    expect(dto.name).toBe('Developer');
  });

  it('turns a blank description into null', async () => {
    const dto = await validate({
      code: 'DEV',
      name: 'Developer',
      description: '   ',
    });

    expect(dto.description).toBeNull();
  });

  it('trims a description that has content', async () => {
    const dto = await validate({
      code: 'DEV',
      name: 'Developer',
      description: '  Writes software.  ',
    });

    expect(dto.description).toBe('Writes software.');
  });

  it.each([
    ['a missing code', { name: 'Developer' }],
    ['a missing name', { code: 'DEV' }],
    ['a blank code', { code: '   ', name: 'Developer' }],
    ['a blank name', { code: 'DEV', name: '   ' }],
    ['a code containing a space', { code: 'QA LEAD', name: 'Developer' }],
    ['a code containing punctuation', { code: 'QA.LEAD', name: 'Developer' }],
    ['a code that is only separators', { code: '--', name: 'Developer' }],
    ['a non-string name', { code: 'DEV', name: 42 }],
    ['a non-boolean isActive', { code: 'DEV', name: 'Dev', isActive: 'yes' }],
    ['an unknown property', { code: 'DEV', name: 'Dev', colour: 'red' }],
  ])('rejects %s', async (_case, body) => {
    await expect(validate(body)).rejects.toThrow();
  });

  it.each([
    ['code', POSITION_CODE_MAX_LENGTH],
    ['name', POSITION_NAME_MAX_LENGTH],
    ['description', POSITION_DESCRIPTION_MAX_LENGTH],
  ])('rejects a %s above its maximum length', async (field, maxLength) => {
    const body = {
      code: 'DEV',
      name: 'Developer',
      [field]: 'A'.repeat(maxLength + 1),
    };

    await expect(validate(body)).rejects.toThrow();
  });

  it('accepts separators inside the code', async () => {
    const dto = await validate({ code: 'qa-lead_2', name: 'QA Lead' });

    expect(dto.code).toBe('QA-LEAD_2');
  });
});
