import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CreateLeaveRequestDto } from './create-leave-request.dto';

const VALID = {
  leaveTypeId: 'lvt-1',
  startDate: '2026-09-07',
  endDate: '2026-09-11',
  reason: 'Family trip',
  replacementEmployeeIds: ['emp-2'],
};

const validate = (body: Record<string, unknown>) => {
  const dto = plainToInstance(CreateLeaveRequestDto, body, {
    // The same options the application's global ValidationPipe applies.
    enableImplicitConversion: false,
  });

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

describe('CreateLeaveRequestDto', () => {
  it('accepts a well-formed body', () => {
    expect(validate(VALID).errors).toHaveLength(0);
  });

  describe('required fields', () => {
    it.each(['leaveTypeId', 'startDate', 'endDate', 'replacementEmployeeIds'])(
      'requires %s',
      (field) => {
        const body: Record<string, unknown> = { ...VALID };
        delete body[field];

        expect(failingProperties(body)).toContain(field);
      },
    );
  });

  describe('replacementEmployeeIds', () => {
    it('requires at least one replacement, which is the feature’s rule', () => {
      expect(
        failingProperties({ ...VALID, replacementEmployeeIds: [] }),
      ).toContain('replacementEmployeeIds');
    });

    it('rejects the same person named twice', () => {
      expect(
        failingProperties({
          ...VALID,
          replacementEmployeeIds: ['emp-2', 'emp-2'],
        }),
      ).toContain('replacementEmployeeIds');
    });

    it('rejects more than the cap', () => {
      expect(
        failingProperties({
          ...VALID,
          replacementEmployeeIds: Array.from(
            { length: 11 },
            (_, index) => `emp-${String(index)}`,
          ),
        }),
      ).toContain('replacementEmployeeIds');
    });

    it('rejects a blank entry rather than sending it to the database', () => {
      expect(
        failingProperties({ ...VALID, replacementEmployeeIds: ['   '] }),
      ).toContain('replacementEmployeeIds');
    });

    it('trims each entry, so a pasted id with spaces still matches a row', () => {
      const { dto } = validate({
        ...VALID,
        replacementEmployeeIds: ['  emp-2  '],
      });

      expect(dto.replacementEmployeeIds).toEqual(['emp-2']);
    });
  });

  describe('dates', () => {
    it('rejects a date that is not ISO-8601', () => {
      expect(
        failingProperties({ ...VALID, startDate: '07/09/2026' }),
      ).toContain('startDate');
    });

    it('keeps the date as a string, parsed once in the service', () => {
      const { dto } = validate(VALID);

      expect(typeof dto.startDate).toBe('string');
    });
  });

  describe('reason', () => {
    it('is optional — no reason given is a real answer', () => {
      const body: Record<string, unknown> = { ...VALID };
      delete body.reason;

      expect(validate(body).errors).toHaveLength(0);
    });

    it('collapses a blank reason to null rather than storing two empties', () => {
      const { dto } = validate({ ...VALID, reason: '   ' });

      expect(dto.reason).toBeNull();
    });

    it('rejects a reason longer than the bound', () => {
      expect(
        failingProperties({ ...VALID, reason: 'x'.repeat(501) }),
      ).toContain('reason');
    });
  });

  describe('fields the client must not set', () => {
    it.each([
      ['employeeId', 'emp-1'],
      ['status', 'APPROVED'],
      ['requestedWorkingDays', 5],
      ['processedById', 'emp-9'],
    ])('rejects %s rather than ignoring it', (field, value) => {
      expect(failingProperties({ ...VALID, [field]: value })).toContain(field);
    });
  });
});
