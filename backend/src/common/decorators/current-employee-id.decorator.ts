import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { Request } from 'express';

import { RELATION_ID_MAX_LENGTH } from '../constants/relation.constants';

/**
 * The header that names the employee making the request.
 *
 * Exported so tests and the feature documentation quote one literal rather than
 * three copies of a string that has to agree.
 */
export const CURRENT_EMPLOYEE_HEADER = 'x-employee-id';

/**
 * The employee the request is being made *by*, taken from
 * {@link CURRENT_EMPLOYEE_HEADER}.
 *
 * **This is a placeholder for authentication, and it is deliberately the only
 * one.** Feature 023 has endpoints under `/me` and an approval action that has
 * to record who approved, while authentication is a later feature; something
 * has to say who is calling in the meantime. Three things about how it is done
 * are the point:
 *
 * 1. **It is one seam, in one file.** Every `/me` route and the status endpoint
 *    read the caller through this decorator and nothing else. When auth arrives,
 *    the body of this function becomes `request.user.employeeId` and no
 *    controller, service, DTO or test signature moves.
 * 2. **It is a header rather than a body or query field.** A caller's identity
 *    is not a property of the resource being created and not a filter over a
 *    collection: putting it in the body would make `employeeId` a field a client
 *    could set per request — which is what it will stop being — and putting it
 *    in the query string would make `/me` a lie, since the scope would then be
 *    stated twice. It also keeps the recorded rule that a response never repeats
 *    what the caller named intact: `/me` payloads carry no `employee` object.
 * 3. **It authenticates nothing and authorises nothing.** Any caller may claim
 *    any employee id. That is not a weakness to be patched here — half an access
 *    check reads as protection while providing none — it is the honest shape of
 *    an API whose auth feature has not been written. The header is a stand-in
 *    for a claim, not a credential.
 *
 * The value is validated for *shape* only — present, non-empty, and no longer
 * than a foreign key may be — so a missing header is a `400` naming it rather
 * than a query for an employee called `undefined`. Whether the employee exists
 * is a question for the service, which answers it with a `404`.
 */
export const CurrentEmployeeId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers[CURRENT_EMPLOYEE_HEADER];

    // Express repeats a header sent twice as an array. One identity was asked
    // for, so two answers are a malformed request rather than a value to pick
    // from — taking the first would let a caller smuggle a second claim past
    // anything that logged only one.
    if (typeof header !== 'string') {
      throw new BadRequestException([missingHeaderMessage()]);
    }

    const employeeId = header.trim();

    if (employeeId.length === 0) {
      throw new BadRequestException([missingHeaderMessage()]);
    }

    if (employeeId.length > RELATION_ID_MAX_LENGTH) {
      throw new BadRequestException([
        `${CURRENT_EMPLOYEE_HEADER} must be at most ${String(RELATION_ID_MAX_LENGTH)} characters`,
      ]);
    }

    return employeeId;
  },
);

/**
 * The message both absent-header paths report, so an empty header and a missing
 * one cannot drift into saying different things about the same mistake.
 *
 * An array at the call site, the same shape the `ValidationPipe` produces, so a
 * client handles it with the code it already has for field errors.
 */
function missingHeaderMessage(): string {
  return `${CURRENT_EMPLOYEE_HEADER} header is required until authentication is implemented`;
}
