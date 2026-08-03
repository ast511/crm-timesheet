import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { UpdateProjectMemberDto } from './update-project-member.dto';

describe('UpdateProjectMemberDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: UpdateProjectMemberDto,
  };

  const validate = (body: unknown): Promise<UpdateProjectMemberDto> =>
    pipe.transform(body, metadata) as Promise<UpdateProjectMemberDto>;

  it('accepts an empty body, which changes nothing', async () => {
    await expect(validate({})).resolves.toEqual({});
  });

  it('accepts each field on its own', async () => {
    await expect(validate({ isProjectManager: true })).resolves.toEqual({
      isProjectManager: true,
    });
    await expect(validate({ joinedAt: '2026-08-01' })).resolves.toEqual({
      joinedAt: '2026-08-01',
    });
    await expect(validate({ leftAt: '2026-12-31' })).resolves.toEqual({
      leftAt: '2026-12-31',
    });
  });

  it('accepts a null leftAt, which is how a membership is reopened', async () => {
    const dto = await validate({ leftAt: null });

    expect(dto.leftAt).toBeNull();
  });

  it.each(['joinedAt', 'isProjectManager'])(
    'rejects a null %s, which the column cannot hold',
    async (field) => {
      await expect(validate({ [field]: null })).rejects.toThrow();
    },
  );

  it.each(['projectId', 'employeeId'])(
    'rejects %s in the body — the key is the URL, not the payload',
    async (field) => {
      await expect(validate({ [field]: 'prj-2' })).rejects.toThrow();
    },
  );

  it('rejects a malformed date', async () => {
    await expect(validate({ leftAt: 'last Friday' })).rejects.toThrow();
  });
});
