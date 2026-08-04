import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  LEAVE_TYPE_ICON_MAX_LENGTH,
  LEAVE_TYPE_LABEL_MAX_LENGTH,
  LEAVE_TYPE_MAX_ALLOCATED_DAYS,
} from '../leave-type.constants';
import { CreateLeaveTypeDto } from './create-leave-type.dto';

/**
 * Run through a `ValidationPipe` configured exactly like the global one, so what
 * is asserted here is the object the controller receives — transforms included,
 * since normalising `code` before the uniqueness check is what makes the
 * database's unique index authoritative.
 */
describe('CreateLeaveTypeDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateLeaveTypeDto,
  };

  const validate = (body: unknown): Promise<CreateLeaveTypeDto> =>
    pipe.transform(body, metadata) as Promise<CreateLeaveTypeDto>;

  /** The three required fields, reused by the cases that vary one thing. */
  const MINIMAL = {
    code: 'ANNUAL',
    label: 'Annual Leave',
    icon: 'umbrella-beach',
  };

  it('accepts a payload with only code, label and icon', async () => {
    const dto = await validate(MINIMAL);

    expect(dto.code).toBe('ANNUAL');
    expect(dto.label).toBe('Annual Leave');
    expect(dto.icon).toBe('umbrella-beach');
  });

  it('trims and upper-cases the code', async () => {
    const dto = await validate({ ...MINIMAL, code: '  annual  ' });

    expect(dto.code).toBe('ANNUAL');
  });

  it('trims the label but keeps its case', async () => {
    const dto = await validate({ ...MINIMAL, label: '  Annual Leave  ' });

    expect(dto.label).toBe('Annual Leave');
  });

  it('trims the icon but keeps its case', async () => {
    const dto = await validate({ ...MINIMAL, icon: '  Umbrella-Beach  ' });

    expect(dto.icon).toBe('Umbrella-Beach');
  });

  /**
   * The name is taken as given. Icon sets disagree on how they spell their keys
   * — kebab-case, camelCase, prefixed — so the API constrains the length and
   * lets the frontend own the vocabulary.
   */
  it.each([
    'umbrella-beach',
    'hospital',
    'baby',
    'graduation-cap',
    'wallet',
    'briefcase',
    'umbrellaBeach',
    'ph:umbrella-beach',
    'fa_umbrella',
  ])('accepts the icon name %s unchanged', async (icon) => {
    const dto = await validate({ ...MINIMAL, icon });

    expect(dto.icon).toBe(icon);
  });

  it.each([
    ['emptiness', ''],
    ['whitespace only', '   '],
  ])('rejects %s as an icon', async (_case, icon) => {
    await expect(validate({ ...MINIMAL, icon })).rejects.toThrow();
  });

  it('rejects an icon longer than the bound', async () => {
    await expect(
      validate({
        ...MINIMAL,
        icon: 'x'.repeat(LEAVE_TYPE_ICON_MAX_LENGTH + 1),
      }),
    ).rejects.toThrow();
  });

  it('rejects a non-string icon', async () => {
    await expect(validate({ ...MINIMAL, icon: 42 })).rejects.toThrow();
  });

  it('upper-cases a colour and keeps the hash', async () => {
    const dto = await validate({ ...MINIMAL, color: '#3b82f6' });

    expect(dto.color).toBe('#3B82F6');
  });

  it('turns a blank colour into null', async () => {
    const dto = await validate({ ...MINIMAL, color: '   ' });

    expect(dto.color).toBeNull();
  });

  it.each(['#FFF', 'red', 'rgb(0,0,0)', '3B82F6', '#GGGGGG'])(
    'rejects %s as a colour',
    async (color) => {
      await expect(validate({ ...MINIMAL, color })).rejects.toThrow();
    },
  );

  it('turns a blank description into null', async () => {
    const dto = await validate({ ...MINIMAL, description: '   ' });

    expect(dto.description).toBeNull();
  });

  /** `0` is "suggest no days"; `null` is "suggest nothing". Both are legal. */
  it('accepts zero allocated days', async () => {
    const dto = await validate({ ...MINIMAL, defaultAllocatedDays: 0 });

    expect(dto.defaultAllocatedDays).toBe(0);
  });

  it('accepts an omitted allocation', async () => {
    const dto = await validate(MINIMAL);

    expect(dto.defaultAllocatedDays).toBeUndefined();
  });

  it('rejects a negative allocation', async () => {
    await expect(
      validate({ ...MINIMAL, defaultAllocatedDays: -1 }),
    ).rejects.toThrow();
  });

  it('rejects an allocation longer than a year', async () => {
    await expect(
      validate({
        ...MINIMAL,
        defaultAllocatedDays: LEAVE_TYPE_MAX_ALLOCATED_DAYS + 1,
      }),
    ).rejects.toThrow();
  });

  /** A budget in whole days; the `integer` column would truncate the rest. */
  it('rejects a fractional allocation', async () => {
    await expect(
      validate({ ...MINIMAL, defaultAllocatedDays: 21.5 }),
    ).rejects.toThrow();
  });

  it('rejects a numeric string for the allocation', async () => {
    await expect(
      validate({ ...MINIMAL, defaultAllocatedDays: '21' }),
    ).rejects.toThrow();
  });

  it.each(['ANNUAL LEAVE', 'ANNUAL!', 'annual leave'])(
    'rejects %s as a code',
    async (code) => {
      await expect(validate({ ...MINIMAL, code })).rejects.toThrow();
    },
  );

  it('rejects an unknown property', async () => {
    await expect(
      validate({ ...MINIMAL, maxConsecutiveDays: 5 }),
    ).rejects.toThrow();
  });

  it('rejects a label longer than the bound', async () => {
    await expect(
      validate({
        ...MINIMAL,
        label: 'x'.repeat(LEAVE_TYPE_LABEL_MAX_LENGTH + 1),
      }),
    ).rejects.toThrow();
  });
});
