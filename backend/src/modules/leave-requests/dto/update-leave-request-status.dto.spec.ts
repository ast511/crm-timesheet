import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { LeaveRequestStatus } from '../../../generated/prisma/enums';
import { UpdateLeaveRequestStatusDto } from './update-leave-request-status.dto';

const validate = (body: Record<string, unknown>) => {
  const dto = plainToInstance(UpdateLeaveRequestStatusDto, body);

  return {
    dto,
    errors: validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  };
};

const failingProperties = (body: Record<string, unknown>): string[] =>
  validate(body).errors.map((error) => error.property);

describe('UpdateLeaveRequestStatusDto', () => {
  it.each([
    LeaveRequestStatus.APPROVED,
    LeaveRequestStatus.REJECTED,
    LeaveRequestStatus.CANCELLED,
  ])('accepts %s', (status) => {
    expect(validate({ status, decisionReason: 'Because' }).errors).toHaveLength(
      0,
    );
  });

  it('rejects PENDING — there is no way back into the undecided state', () => {
    expect(failingProperties({ status: LeaveRequestStatus.PENDING })).toContain(
      'status',
    );
  });

  it('rejects a status outside the enum entirely', () => {
    expect(failingProperties({ status: 'MAYBE' })).toContain('status');
  });

  it('requires a status', () => {
    expect(failingProperties({})).toContain('status');
  });

  describe('decisionReason', () => {
    it('is optional here — the conditional rule is the service’s', () => {
      expect(
        validate({ status: LeaveRequestStatus.APPROVED }).errors,
      ).toHaveLength(0);
    });

    it('collapses whitespace to null, so it cannot satisfy a presence check', () => {
      const { dto } = validate({
        status: LeaveRequestStatus.REJECTED,
        decisionReason: '   ',
      });

      expect(dto.decisionReason).toBeNull();
    });

    it('rejects a reason longer than the bound', () => {
      expect(
        failingProperties({
          status: LeaveRequestStatus.REJECTED,
          decisionReason: 'x'.repeat(501),
        }),
      ).toContain('decisionReason');
    });
  });

  describe('fields the client must not set', () => {
    it.each([
      ['processedById', 'emp-9'],
      ['processedAt', '2026-08-04T10:00:00.000Z'],
    ])(
      'rejects %s rather than letting a client sign for somebody',
      (field, value) => {
        expect(
          failingProperties({
            status: LeaveRequestStatus.APPROVED,
            [field]: value,
          }),
        ).toContain(field);
      },
    );
  });
});
