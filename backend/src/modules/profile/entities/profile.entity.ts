import { ApiProperty } from '@nestjs/swagger';

import { toIsoTimestamp } from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import { UiColorScheme, UiCornerRadius } from '../../../generated/prisma/enums';
import type {
  AccountStatus,
  EmployeeStatus,
  SeniorityLevel,
  UserRole,
} from '../../../generated/prisma/enums';

/**
 * The signed-in person, as their own profile screen sees them.
 *
 * **Two entities in one payload, and the shape says which is which.** `User` is
 * the login — email, role, account state — and `Employee` is the employment
 * record — code, position, department, hire date. They are a 1—0..1 relation and
 * the application keeps them apart everywhere else (account concerns on
 * `/users`, HR data on `/employees`), so flattening them here would be the one
 * place a reader could stop being able to tell which half a field belongs to.
 * Nesting `employee` also makes its absence expressible, which a flat shape
 * could not: a super-admin created to administer the system has no employment
 * record, and `employee: null` is the honest way to say so.
 *
 * It is the read side of `/profile/me`; what may be *written* is a far shorter
 * list — see `UpdateProfileDto`, which is three fields. Everything else here is
 * shown because it is worth knowing and changed elsewhere by somebody entitled
 * to.
 *
 * **It is also where a frontend reads the two UI preferences** (Feature 039).
 * `account.colorScheme` and `account.cornerRadius` are on this payload rather
 * than on the login response, so a client applies the theme from the same call
 * that gives it the person's name.
 *
 * **No `passwordHash` and no token of any kind.** The account half is assembled
 * from an explicit `select` that never names the hash, so it is not read out of
 * PostgreSQL at all — the guarantee `UserEntity` states in full, kept the same
 * way. `account_tokens` is not joined and has no relation on this shape: an
 * outstanding activation or reset link is a credential, and a profile endpoint
 * returning one would hand somebody's session the means to reset their own
 * password without knowing it.
 */
export class ProfileEntity {
  account!: ProfileAccount;
  /** `null` for an account with no employment record — a system super-admin. */
  employee!: ProfileEmployee | null;
}

/** The login half: who the caller is to the system. */
export class ProfileAccount {
  id!: string;
  email!: string;
  username!: string | null;
  role!: UserRole;
  status!: AccountStatus;

  /**
   * The palette this person chose — one of the application's eight themes.
   *
   * **This endpoint is where a frontend reads it**, on load, and it is the only
   * place the API sends it. `GET /auth/me` deliberately does not carry it; the
   * argument is in `ProfileController`, and the short version is that the query
   * behind `/auth/me` runs on every authenticated request and is not the place to
   * add two columns nothing authenticates with.
   *
   * Changed through `PATCH /profile/me`, like every other writable field here.
   *
   * The `enum` is stated rather than left to the Swagger plugin's inference —
   * see {@link ProfileAccount.cornerRadius}, where leaving it cost the document
   * its order.
   */
  @ApiProperty({ enum: UiColorScheme, example: UiColorScheme.VIOLET })
  colorScheme!: UiColorScheme;

  /**
   * How rounded this person wants the corners — a symbol, not a number.
   *
   * The five members map onto CSS radii, and **the frontend owns the mapping**:
   * `NONE` = `0rem`, `SMALL` = `0.3rem`, `MEDIUM` = `0.5rem` (the default),
   * `LARGE` = `0.75rem`, `FULL` = `1rem`. The API never sends the number — see
   * [UiCornerRadius] in `schema.prisma` for why storing one was rejected.
   *
   * **The `enum` is passed explicitly, and it has to be.** Everywhere else in
   * this application the Swagger plugin infers an enum from the field's type and
   * gets the declaration order right; for this one it did not, and published
   * `NONE, MEDIUM, SMALL, LARGE, FULL` — a scale with its middle two rungs
   * swapped, which a settings screen generated from the document would have
   * rendered in that order. Handing it the runtime enum object instead of a
   * type-only reference makes the order the schema's, not the type checker's.
   */
  @ApiProperty({ enum: UiCornerRadius, example: UiCornerRadius.LARGE })
  cornerRadius!: UiCornerRadius;

  createdAt!: string;
}

/**
 * The employment half: who the caller is to the company.
 *
 * `department` and `position` are the records rather than their ids, the same
 * call `EmployeeEntity` makes: a profile screen renders the names, and sending
 * ids would mean two more requests to display somebody's own page.
 */
export class ProfileEmployee {
  id!: string;
  employeeCode!: string;
  firstName!: string;
  lastName!: string;
  /** The one field of *this half* `PATCH /profile/me` may change. */
  phone!: string | null;
  hireDate!: string;
  terminationDate!: string | null;
  seniority!: SeniorityLevel;
  status!: EmployeeStatus;
  department!: { id: string; code: string; name: string };
  position!: { id: string; code: string; name: string };
}

/**
 * The columns a profile read selects, from `users` outwards.
 *
 * One query with a join rather than two round trips, because the two halves are
 * one screen. `satisfies Prisma.UserSelect` checks the keys against the model
 * without widening the constant, so a column renamed in `schema.prisma` breaks
 * the build here instead of at runtime — and `passwordHash` is absent, which is
 * the property this constant exists to hold.
 */
export const PROFILE_SELECT = {
  id: true,
  email: true,
  username: true,
  role: true,
  status: true,
  colorScheme: true,
  cornerRadius: true,
  createdAt: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      phone: true,
      hireDate: true,
      terminationDate: true,
      seniority: true,
      status: true,
      department: { select: { id: true, code: true, name: true } },
      position: { select: { id: true, code: true, name: true } },
    },
  },
} as const satisfies Prisma.UserSelect;

/** A row read through {@link PROFILE_SELECT}. */
export interface ProfileRow {
  id: string;
  email: string;
  username: string | null;
  role: UserRole;
  status: AccountStatus;
  colorScheme: UiColorScheme;
  cornerRadius: UiCornerRadius;
  createdAt: Date;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    hireDate: Date;
    terminationDate: Date | null;
    seniority: SeniorityLevel;
    status: EmployeeStatus;
    department: { id: string; code: string; name: string };
    position: { id: string; code: string; name: string };
  } | null;
}

/**
 * Maps the joined row onto the payload.
 *
 * The dates become ISO-8601 strings through `toIsoTimestamp`, the project's
 * single definition of that format — `hireDate` included, which is a calendar
 * day stored at UTC midnight and is rendered as a full instant here for the
 * reason `EmployeeEntity` gives.
 */
export function toProfileEntity(row: ProfileRow): ProfileEntity {
  return {
    account: {
      id: row.id,
      email: row.email,
      username: row.username,
      role: row.role,
      status: row.status,
      colorScheme: row.colorScheme,
      cornerRadius: row.cornerRadius,
      createdAt: toIsoTimestamp(row.createdAt),
    },
    employee:
      row.employee === null
        ? null
        : {
            id: row.employee.id,
            employeeCode: row.employee.employeeCode,
            firstName: row.employee.firstName,
            lastName: row.employee.lastName,
            phone: row.employee.phone,
            hireDate: toIsoTimestamp(row.employee.hireDate),
            terminationDate:
              row.employee.terminationDate === null
                ? null
                : toIsoTimestamp(row.employee.terminationDate),
            seniority: row.employee.seniority,
            status: row.employee.status,
            department: row.employee.department,
            position: row.employee.position,
          },
  };
}
