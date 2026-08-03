import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { RELATION_ID_MAX_LENGTH } from '../../../common/constants/relation.constants';
import { CreateProjectMemberDto } from './create-project-member.dto';

/**
 * Run through a `ValidationPipe` configured exactly like the global one, so
 * what is asserted here is the object the controller receives — transforms
 * included.
 */
describe('CreateProjectMemberDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateProjectMemberDto,
  };

  const validate = (body: unknown): Promise<CreateProjectMemberDto> =>
    pipe.transform(body, metadata) as Promise<CreateProjectMemberDto>;

  /** The only required field; the project comes from the path. */
  const REQUIRED = { employeeId: 'emp-1' };

  it('accepts a payload with only the employee', async () => {
    await expect(validate(REQUIRED)).resolves.toEqual(REQUIRED);
  });

  it('trims the id', async () => {
    const dto = await validate({ employeeId: '  emp-1  ' });

    expect(dto.employeeId).toBe('emp-1');
  });

  it('requires employeeId', async () => {
    await expect(validate({})).rejects.toThrow();
  });

  it('rejects a blank employeeId', async () => {
    await expect(validate({ employeeId: '   ' })).rejects.toThrow();
  });

  it('rejects an id past the shared length bound', async () => {
    await expect(
      validate({ employeeId: 'e'.repeat(RELATION_ID_MAX_LENGTH + 1) }),
    ).rejects.toThrow();
  });

  it('rejects projectId in the body — the path carries it', async () => {
    await expect(
      validate({ ...REQUIRED, projectId: 'prj-2' }),
    ).rejects.toThrow();
  });

  it('accepts the manager flag', async () => {
    const dto = await validate({ ...REQUIRED, isProjectManager: true });

    expect(dto.isProjectManager).toBe(true);
  });

  it('rejects a string where the manager flag belongs', async () => {
    // The body is JSON, so `"true"` is a client bug rather than a spelling of
    // the boolean — unlike the query string, which `@ToBoolean()` converts.
    await expect(
      validate({ ...REQUIRED, isProjectManager: 'true' }),
    ).rejects.toThrow();
  });

  it('accepts both ISO dates', async () => {
    const dto = await validate({
      ...REQUIRED,
      joinedAt: '2026-08-01',
      leftAt: '2026-12-31T00:00:00.000Z',
    });

    expect(dto.joinedAt).toBe('2026-08-01');
    expect(dto.leftAt).toBe('2026-12-31T00:00:00.000Z');
  });

  it('rejects a date whose meaning depends on the reader', async () => {
    await expect(
      validate({ ...REQUIRED, joinedAt: '01/13/2020' }),
    ).rejects.toThrow();
  });

  it('accepts a null leftAt, the one nullable column', async () => {
    const dto = await validate({ ...REQUIRED, leftAt: null });

    expect(dto.leftAt).toBeNull();
  });

  it.each(['joinedAt', 'isProjectManager'])(
    'rejects a null %s, which the column cannot hold',
    async (field) => {
      await expect(validate({ ...REQUIRED, [field]: null })).rejects.toThrow();
    },
  );

  it('rejects an unknown property rather than ignoring it', async () => {
    await expect(validate({ ...REQUIRED, role: 'lead' })).rejects.toThrow();
  });
});
