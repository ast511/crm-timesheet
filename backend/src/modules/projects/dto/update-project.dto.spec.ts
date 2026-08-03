import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { UpdateProjectDto } from './update-project.dto';

/**
 * What distinguishes this class from `CreateProjectDto` is which fields accept
 * `null`, so that is what the cases below concentrate on: the four nullable
 * columns take it as "clear this", and every other field rejects it rather than
 * letting it reach a column that cannot hold it.
 */
describe('UpdateProjectDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: UpdateProjectDto,
  };

  const validate = (body: unknown): Promise<UpdateProjectDto> =>
    pipe.transform(body, metadata) as Promise<UpdateProjectDto>;

  it('accepts an empty body, which changes nothing', async () => {
    await expect(validate({})).resolves.toEqual({});
  });

  it('accepts a single field', async () => {
    const dto = await validate({ name: 'CRM TimeSheet v2' });

    expect(dto).toEqual({ name: 'CRM TimeSheet v2' });
  });

  it('normalises the code exactly as creation does', async () => {
    const dto = await validate({ code: '  crm-ts  ' });

    expect(dto.code).toBe('CRM-TS');
  });

  it.each([
    ['description', 'description'],
    ['color', 'color'],
    ['startDate', 'startDate'],
    ['endDate', 'endDate'],
  ])('accepts null for the nullable field %s', async (_case, field) => {
    const dto = (await validate({ [field]: null })) as Record<string, unknown>;

    expect(dto[field]).toBeNull();
  });

  it('clears the colour with a blank string too', async () => {
    const dto = await validate({ color: '' });

    expect(dto.color).toBeNull();
  });

  it.each([
    ['code', { code: null }],
    ['name', { name: null }],
    ['clientName', { clientName: null }],
    ['estimatedHours', { estimatedHours: null }],
    ['isArchived', { isArchived: null }],
    ['projectStatus', { projectStatus: null }],
    ['projectPriority', { projectPriority: null }],
  ])('rejects null for the non-nullable field %s', async (_case, body) => {
    await expect(validate(body)).rejects.toThrow();
  });

  it('accepts isArchived in both directions, since archiving is reversible', async () => {
    await expect(validate({ isArchived: true })).resolves.toEqual({
      isArchived: true,
    });
    await expect(validate({ isArchived: false })).resolves.toEqual({
      isArchived: false,
    });
  });

  it.each([
    ['a blank code', { code: '   ' }],
    ['a blank clientName', { clientName: '   ' }],
    ['negative hours', { estimatedHours: -1 }],
    ['a malformed colour', { color: '#FFF' }],
    ['a status outside the enum', { projectStatus: 'PAUSED' }],
    ['the removed isActive field', { isActive: false }],
    ['an unknown property', { departmentId: 'dep-1' }],
  ])('rejects %s', async (_case, body) => {
    await expect(validate(body)).rejects.toThrow();
  });
});
