import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  ProjectPriority,
  ProjectStatus,
} from '../../../generated/prisma/enums';
import {
  PROJECT_CLIENT_NAME_MAX_LENGTH,
  PROJECT_CODE_MAX_LENGTH,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_MAX_ESTIMATED_HOURS,
  PROJECT_NAME_MAX_LENGTH,
} from '../project.constants';
import { CreateProjectDto } from './create-project.dto';

/**
 * Run through a `ValidationPipe` configured exactly like the global one, so
 * what is asserted here is the object the controller receives — transforms
 * included, since normalising `code` before the uniqueness check is what makes
 * the database's unique index authoritative, and normalising `color` is what
 * makes two spellings of one colour the same stored value.
 */
describe('CreateProjectDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateProjectDto,
  };

  const validate = (body: unknown): Promise<CreateProjectDto> =>
    pipe.transform(body, metadata) as Promise<CreateProjectDto>;

  /** The four required fields; every test starts from these. */
  const REQUIRED = {
    code: 'CRM-TS',
    name: 'CRM TimeSheet',
    clientName: 'Internal',
    estimatedHours: 2400,
  };

  it('accepts a payload with only the required fields', async () => {
    const dto = await validate(REQUIRED);

    expect(dto).toEqual(REQUIRED);
  });

  it('trims and upper-cases the code', async () => {
    const dto = await validate({ ...REQUIRED, code: '  crm-ts  ' });

    expect(dto.code).toBe('CRM-TS');
  });

  it('trims the name and the client but keeps their case', async () => {
    const dto = await validate({
      ...REQUIRED,
      name: '  CRM TimeSheet  ',
      clientName: '  Aurora Retail Group  ',
    });

    expect(dto.name).toBe('CRM TimeSheet');
    expect(dto.clientName).toBe('Aurora Retail Group');
  });

  it('turns a blank description into null', async () => {
    const dto = await validate({ ...REQUIRED, description: '   ' });

    expect(dto.description).toBeNull();
  });

  it('accepts zero hours, which is how "not estimated yet" is stated', async () => {
    const dto = await validate({ ...REQUIRED, estimatedHours: 0 });

    expect(dto.estimatedHours).toBe(0);
  });

  describe('color', () => {
    it('upper-cases a lower-case hex value', async () => {
      const dto = await validate({ ...REQUIRED, color: '#3b82f6' });

      expect(dto.color).toBe('#3B82F6');
    });

    it('trims before checking, so a padded value is still valid', async () => {
      const dto = await validate({ ...REQUIRED, color: '  #3B82F6  ' });

      expect(dto.color).toBe('#3B82F6');
    });

    it('turns a blank value into null', async () => {
      const dto = await validate({ ...REQUIRED, color: '   ' });

      expect(dto.color).toBeNull();
    });

    it.each([
      ['the three-digit shorthand', '#FFF'],
      ['a missing hash', '3B82F6'],
      ['a non-hex digit', '#GGGGGG'],
      ['eight digits', '#3B82F6FF'],
      ['a named colour', 'red'],
      ['an rgb() function', 'rgb(59, 130, 246)'],
    ])('rejects %s', async (_case, color) => {
      await expect(validate({ ...REQUIRED, color })).rejects.toThrow();
    });
  });

  describe('the enum columns', () => {
    it.each(Object.values(ProjectStatus))(
      'accepts the status %s',
      async (projectStatus) => {
        const dto = await validate({ ...REQUIRED, projectStatus });

        expect(dto.projectStatus).toBe(projectStatus);
      },
    );

    it.each(Object.values(ProjectPriority))(
      'accepts the priority %s',
      async (projectPriority) => {
        const dto = await validate({ ...REQUIRED, projectPriority });

        expect(dto.projectPriority).toBe(projectPriority);
      },
    );

    it.each([
      ['a status outside the enum', { projectStatus: 'PAUSED' }],
      ['the stored spelling of a status', { projectStatus: 'on_hold' }],
      ['a lower-cased priority', { projectPriority: 'high' }],
      [
        'a null status, since the column is not nullable',
        {
          projectStatus: null,
        },
      ],
    ])('rejects %s', async (_case, overrides) => {
      await expect(validate({ ...REQUIRED, ...overrides })).rejects.toThrow();
    });
  });

  it.each([
    ['a missing code', { code: undefined }],
    ['a missing name', { name: undefined }],
    ['a missing clientName', { clientName: undefined }],
    ['a missing estimatedHours', { estimatedHours: undefined }],
    ['a blank code', { code: '   ' }],
    ['a blank name', { name: '   ' }],
    ['a blank clientName', { clientName: '   ' }],
    ['a code containing a space', { code: 'CRM TS' }],
    ['a code containing punctuation', { code: 'CRM.TS' }],
    ['negative hours', { estimatedHours: -1 }],
    ['fractional hours', { estimatedHours: 120.5 }],
    ['hours as a string', { estimatedHours: '2400' }],
    [
      'hours above the maximum',
      { estimatedHours: PROJECT_MAX_ESTIMATED_HOURS + 1 },
    ],
    ['a non-boolean isArchived', { isArchived: 'yes' }],
    ['the removed isActive field', { isActive: true }],
    [
      'a null isArchived, since the column is not nullable',
      {
        isArchived: null,
      },
    ],
    ['a startDate that is not a date', { startDate: 'last Tuesday' }],
    ['an ambiguous date format', { startDate: '01/13/2020' }],
  ])('rejects %s', async (_case, overrides) => {
    await expect(validate({ ...REQUIRED, ...overrides })).rejects.toThrow();
  });

  it('rejects an unknown property', async () => {
    await expect(
      validate({ ...REQUIRED, departmentId: 'dep-1' }),
    ).rejects.toThrow();
  });

  it.each([
    ['code', PROJECT_CODE_MAX_LENGTH],
    ['name', PROJECT_NAME_MAX_LENGTH],
    ['clientName', PROJECT_CLIENT_NAME_MAX_LENGTH],
    ['description', PROJECT_DESCRIPTION_MAX_LENGTH],
  ])('rejects a %s above its maximum length', async (field, maxLength) => {
    await expect(
      validate({ ...REQUIRED, [field]: 'A'.repeat(maxLength + 1) }),
    ).rejects.toThrow();
  });

  /**
   * The rule that is *not* here: whether `endDate` falls after `startDate`.
   * It spans two fields and, on a patch, the row already stored — so it is the
   * service's, and this class accepts a reversed pair without complaint.
   */
  it('leaves the ordering of the two dates to the service', async () => {
    const dto = await validate({
      ...REQUIRED,
      startDate: '2026-06-30',
      endDate: '2026-01-12',
    });

    expect(dto.startDate).toBe('2026-06-30');
    expect(dto.endDate).toBe('2026-01-12');
  });
});
