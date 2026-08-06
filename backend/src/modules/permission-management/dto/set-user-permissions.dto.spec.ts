import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  MAX_PERMISSION_KEYS_PER_REQUEST,
  PERMISSION_KEY_MAX_LENGTH,
} from '../permission-management.constants';
import { ApplyPresetDto } from './apply-preset.dto';
import { SetUserPermissionsDto } from './set-user-permissions.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

describe('SetUserPermissionsDto', () => {
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: SetUserPermissionsDto,
  };

  const validate = (body: unknown): Promise<SetUserPermissionsDto> =>
    pipe.transform(body, metadata) as Promise<SetUserPermissionsDto>;

  it('accepts the full intended matrix', async () => {
    await expect(
      validate({ permissionKeys: ['TIMESHEET.CREATE', 'TIMESHEET.EDIT'] }),
    ).resolves.toEqual({
      permissionKeys: ['TIMESHEET.CREATE', 'TIMESHEET.EDIT'],
    });
  });

  it('accepts an empty array: it is "hold nothing", not a missing field', async () => {
    // Deliberately different from DELETE, which resets to the role. An
    // ArrayMinSize(1) would have collapsed the two by making one impossible.
    await expect(validate({ permissionKeys: [] })).resolves.toEqual({
      permissionKeys: [],
    });
  });

  it('trims each key', async () => {
    await expect(
      validate({ permissionKeys: ['  TIMESHEET.CREATE  '] }),
    ).resolves.toEqual({ permissionKeys: ['TIMESHEET.CREATE'] });
  });

  it('rejects a duplicate key at the route rather than at the unique index', async () => {
    // The index would surface as a 500; this is a 400 naming the field. Listing
    // a permission twice does not grant it twice.
    await expect(
      validate({ permissionKeys: ['TIMESHEET.CREATE', 'TIMESHEET.CREATE'] }),
    ).rejects.toThrow();
  });

  it('rejects a missing field', async () => {
    await expect(validate({})).rejects.toThrow();
  });

  it('rejects a string where an array belongs', async () => {
    // Without the explicit @IsArray(), class-validator silently skips every
    // `{ each: true }` rule and this would reach the service.
    await expect(
      validate({ permissionKeys: 'TIMESHEET.CREATE' }),
    ).rejects.toThrow();
  });

  it('rejects a blank key inside the array', async () => {
    await expect(validate({ permissionKeys: ['   '] })).rejects.toThrow();
  });

  it('rejects a key past the length bound', async () => {
    await expect(
      validate({ permissionKeys: ['A'.repeat(PERMISSION_KEY_MAX_LENGTH + 1)] }),
    ).rejects.toThrow();
  });

  it('rejects more keys than one request may carry', async () => {
    const keys = Array.from(
      { length: MAX_PERMISSION_KEYS_PER_REQUEST + 1 },
      (_unused, index) => `RESOURCE.ACTION_${String(index)}`,
    );

    await expect(validate({ permissionKeys: keys })).rejects.toThrow();
  });

  it('rejects a field a client may not write', async () => {
    // The actor comes from @CurrentUser(), never from the body.
    await expect(
      validate({ permissionKeys: [], changedByUserId: 'usr-9' }),
    ).rejects.toThrow();
  });
});

describe('ApplyPresetDto', () => {
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: ApplyPresetDto,
  };

  const validate = (body: unknown): Promise<ApplyPresetDto> =>
    pipe.transform(body, metadata) as Promise<ApplyPresetDto>;

  it('accepts a preset key, trimmed', async () => {
    await expect(validate({ presetKey: ' HR_FULL_ACCESS ' })).resolves.toEqual({
      presetKey: 'HR_FULL_ACCESS',
    });
  });

  it('requires the key: applying no preset is not a request', async () => {
    await expect(validate({})).rejects.toThrow();
  });

  it('rejects a blank key', async () => {
    await expect(validate({ presetKey: '  ' })).rejects.toThrow();
  });

  it('rejects a merge flag: a preset replaces, and there is nothing to choose', async () => {
    await expect(
      validate({ presetKey: 'HR_STANDARD', merge: true }),
    ).rejects.toThrow();
  });
});
