import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

import { ERROR_CODES } from '../constants/error-codes.constants';
import { codedError } from '../errors/coded-error';
import {
  AuthenticatedRequest,
  resolveCurrentUser,
} from './current-user.decorator';

/**
 * The employee the request is being made *by*, taken from the authenticated
 * caller's employment record.
 *
 * **The other half of the seam Feature 032 replaced.** Feature 023 wrote this
 * first, and recorded what it was waiting for:
 *
 * > It is one seam, in one file. Every `/me` route and the status endpoint read
 * > the caller through this decorator and nothing else. When auth arrives, the
 * > body of this function becomes `request.user.employeeId` and no controller,
 * > service, DTO or test signature moves.
 *
 * It is now literally that, by way of `resolveCurrentUser` rather than by
 * reaching into the request a second time — the two decorators answer questions
 * about one caller, and reading `request.user` in two files would be the place
 * they could eventually disagree. The `x-employee-id` header is gone; nothing in
 * this application reads it.
 *
 * The type is unchanged: a `string`, never null, because every route that uses
 * this is a route about the caller's own employment — their timesheet, their
 * leave, their `/me`. What changed is what happens when there is no employment
 * record. The header could always be left out and the answer was a `400` naming
 * it; an authenticated caller cannot leave anything out, so the absence is now a
 * fact about the account rather than a mistake in the request, and the answer is
 * a `403`: a super-admin with no `employees` row is perfectly well
 * authenticated and simply has no timesheet to open. That is the only response
 * code in this application that Feature 032 changed, and it changed because the
 * question changed.
 */
export const CurrentEmployeeId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const { employeeId } = resolveCurrentUser(
      context.switchToHttp().getRequest<AuthenticatedRequest>(),
    );

    if (employeeId === null) {
      throw new ForbiddenException(
        codedError(
          ERROR_CODES.AUTH_NO_EMPLOYEE_RECORD,
          NO_EMPLOYEE_RECORD_MESSAGE,
        ),
      );
    }

    return employeeId;
  },
);

/**
 * What an account with no employment record is told.
 *
 * Exported so the specs and the feature documentation quote one literal rather
 * than three copies of a sentence that has to agree.
 */
export const NO_EMPLOYEE_RECORD_MESSAGE =
  'This endpoint is about your own employment record, and your account has none';
