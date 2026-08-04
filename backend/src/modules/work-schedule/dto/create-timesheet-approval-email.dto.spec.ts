import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { EMAIL_MAX_LENGTH } from '../../../common/constants/email.constants';
import { CreateTimesheetApprovalEmailDto } from './create-timesheet-approval-email.dto';

/**
 * Run through a `ValidationPipe` configured exactly like the global one, so
 * what is asserted here is the object the controller receives — the transform
 * included, since lower-casing before the duplicate check is what makes the
 * unique index on `email` authoritative.
 */
describe('CreateTimesheetApprovalEmailDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateTimesheetApprovalEmailDto,
  };

  const validate = (body: unknown): Promise<CreateTimesheetApprovalEmailDto> =>
    pipe.transform(body, metadata) as Promise<CreateTimesheetApprovalEmailDto>;

  it('accepts an address', async () => {
    const dto = await validate({ email: 'hr@company.com' });

    expect(dto).toEqual({ email: 'hr@company.com' });
  });

  it('trims and lower-cases, so one mailbox cannot be added twice', async () => {
    const dto = await validate({ email: '  HR@Company.com  ' });

    expect(dto.email).toBe('hr@company.com');
  });

  it.each(['not-an-email', 'hr@', '@company.com', '', '   '])(
    'rejects %p',
    async (email) => {
      await expect(validate({ email })).rejects.toThrow();
    },
  );

  it('rejects a missing address', async () => {
    await expect(validate({})).rejects.toThrow();
  });

  it('rejects an address above the RFC 5321 length', async () => {
    const email = `${'a'.repeat(EMAIL_MAX_LENGTH)}@company.com`;

    await expect(validate({ email })).rejects.toThrow();
  });

  /**
   * There is one schedule and the path names it, so an id in the body could
   * only repeat what the URL said. `forbidNonWhitelisted` makes the attempt a
   * 400 rather than a silently dropped field.
   */
  it('rejects a workScheduleId in the body', async () => {
    await expect(
      validate({ email: 'hr@company.com', workScheduleId: 'work_schedule' }),
    ).rejects.toThrow();
  });
});
