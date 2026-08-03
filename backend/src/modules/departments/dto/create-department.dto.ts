import { IsBoolean, IsOptional } from 'class-validator';

import {
  IsDepartmentCode,
  IsDepartmentDescription,
  IsDepartmentName,
} from './department-field.decorators';

/**
 * Body of `POST /api/v1/departments`.
 *
 * `code` and `name` are the only required fields; `isActive` is left to the
 * schema's `true` default rather than repeated here, so "a new department is
 * active" stays one decision made in one place.
 *
 * Unknown properties never reach this class — the global `ValidationPipe` runs
 * with `forbidNonWhitelisted`, so a typo in a payload is a 400 rather than a
 * silently ignored field.
 */
export class CreateDepartmentDto {
  @IsDepartmentCode()
  readonly code!: string;

  @IsDepartmentName()
  readonly name!: string;

  @IsOptional()
  @IsDepartmentDescription()
  readonly description?: string | null;

  @IsOptional()
  @IsBoolean()
  readonly isActive?: boolean;
}
