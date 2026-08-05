import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';

import { UserRole } from '../../generated/prisma/enums';
import {
  ADMINISTRATIVE_ROLES,
  isAdministrativeRole,
} from '../constants/role.constants';
import { CURRENT_EMPLOYEE_HEADER } from './current-employee-id.decorator';
import {
  CURRENT_USER_HEADER,
  CURRENT_USER_ROLE_HEADER,
  resolveCurrentUser,
} from './current-user.decorator';

/**
 * The decorator itself runs inside Nest's pipeline, so it is exercised through
 * real requests in the notifications routing spec. What is tested here is its
 * body — the header rules — which is why they were extracted into a plain
 * function in the first place.
 */
const requestWith = (headers: Record<string, string | string[]>): Request =>
  ({ headers }) as unknown as Request;

const VALID = {
  [CURRENT_USER_HEADER]: 'usr-1',
  [CURRENT_USER_ROLE_HEADER]: 'HR',
};

describe('resolveCurrentUser', () => {
  it('reads the account, the role and the employee record', () => {
    expect(
      resolveCurrentUser(
        requestWith({ ...VALID, [CURRENT_EMPLOYEE_HEADER]: 'emp-1' }),
      ),
    ).toEqual({
      userId: 'usr-1',
      employeeId: 'emp-1',
      role: UserRole.HR,
      administrativeAccess: true,
    });
  });

  it('trims each header', () => {
    const user = resolveCurrentUser(
      requestWith({
        [CURRENT_USER_HEADER]: '  usr-1  ',
        [CURRENT_USER_ROLE_HEADER]: '  hr  ',
        [CURRENT_EMPLOYEE_HEADER]: '  emp-1  ',
      }),
    );

    expect(user.userId).toBe('usr-1');
    expect(user.employeeId).toBe('emp-1');
    expect(user.role).toBe(UserRole.HR);
  });

  describe('the account header', () => {
    it('is required, and the message names it', () => {
      expect(() =>
        resolveCurrentUser(
          requestWith({ [CURRENT_USER_ROLE_HEADER]: 'ADMIN' }),
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects a blank value', () => {
      expect(() =>
        resolveCurrentUser(
          requestWith({ ...VALID, [CURRENT_USER_HEADER]: '  ' }),
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects a value longer than a foreign key may be', () => {
      expect(() =>
        resolveCurrentUser(
          requestWith({ ...VALID, [CURRENT_USER_HEADER]: 'x'.repeat(51) }),
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects the header sent twice rather than picking one', () => {
      expect(() =>
        resolveCurrentUser(
          requestWith({ ...VALID, [CURRENT_USER_HEADER]: ['usr-1', 'usr-2'] }),
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('the employee header', () => {
    it('is optional — not every account has an employment record', () => {
      expect(resolveCurrentUser(requestWith(VALID)).employeeId).toBeNull();
    });

    it('is still validated when it is sent', () => {
      expect(() =>
        resolveCurrentUser(
          requestWith({ ...VALID, [CURRENT_EMPLOYEE_HEADER]: '   ' }),
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('the role header', () => {
    it('is required', () => {
      expect(() =>
        resolveCurrentUser(requestWith({ [CURRENT_USER_HEADER]: 'usr-1' })),
      ).toThrow(BadRequestException);
    });

    it('rejects a role the schema does not know, naming the legal ones', () => {
      // The messages live in `response.message` rather than in `.message`: the
      // exception carries an array, the same shape the ValidationPipe produces.
      let messages: unknown;

      try {
        resolveCurrentUser(
          requestWith({ ...VALID, [CURRENT_USER_ROLE_HEADER]: 'MANAGER' }),
        );
      } catch (error) {
        ({ message: messages } = (
          error as BadRequestException
        ).getResponse() as { message: string[] });
      }

      expect(messages).toEqual([
        expect.stringContaining('SUPERADMIN, ADMIN, HR, USER'),
      ]);
    });

    it('accepts any case, since a header is not a payload field', () => {
      expect(
        resolveCurrentUser(
          requestWith({ ...VALID, [CURRENT_USER_ROLE_HEADER]: 'superadmin' }),
        ).role,
      ).toBe(UserRole.SUPERADMIN);
    });
  });

  describe('administrativeAccess', () => {
    it.each([...ADMINISTRATIVE_ROLES])('is true for %s', (role) => {
      expect(
        resolveCurrentUser(
          requestWith({ ...VALID, [CURRENT_USER_ROLE_HEADER]: role }),
        ).administrativeAccess,
      ).toBe(true);
    });

    it('is false for an ordinary employee', () => {
      expect(
        resolveCurrentUser(
          requestWith({ ...VALID, [CURRENT_USER_ROLE_HEADER]: UserRole.USER }),
        ).administrativeAccess,
      ).toBe(false);
    });

    it('is derived from the role rather than read from a header of its own', () => {
      const user = resolveCurrentUser(
        requestWith({
          ...VALID,
          [CURRENT_USER_ROLE_HEADER]: UserRole.USER,
          'x-administrative-access': 'true',
        }),
      );

      expect(user.administrativeAccess).toBe(false);
    });
  });
});

describe('isAdministrativeRole', () => {
  it('accepts the three administrative roles and nothing else', () => {
    const administrative = Object.values(UserRole).filter(isAdministrativeRole);

    expect(administrative).toEqual([...ADMINISTRATIVE_ROLES]);
  });

  it('excludes USER, which is what makes the list mean anything', () => {
    expect(isAdministrativeRole(UserRole.USER)).toBe(false);
  });
});
