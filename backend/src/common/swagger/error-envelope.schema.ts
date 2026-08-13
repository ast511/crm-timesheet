import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ERROR_CODES } from '../constants/error-codes.constants';
import { ApiErrorResponse } from '../interfaces/api-response.interface';

/**
 * The Feature 033 error envelope, as a **named schema** in the OpenAPI document.
 *
 * Every failure this API renders has this shape — `AllExceptionsFilter` is the
 * only thing that produces one — so it is described once here and referenced by
 * `$ref` from every documented error response. A client reading the document
 * sees `#/components/schemas/ErrorEnvelope` beside a `401` on one route and the
 * same `$ref` beside a `409` on another, which is the truth: the status code
 * varies, the body does not.
 *
 * **`implements ApiErrorResponse` is the anti-drift device, not a formality.**
 * The interface in `api-response.interface.ts` is what the filter actually
 * builds; this class is what the documentation promises. Declaring the one
 * against the other means a field added to the envelope, renamed, or retyped
 * fails the build here rather than producing documentation that quietly
 * describes an envelope the API stopped sending. It is the same trick
 * `satisfies Prisma.PublicHolidaySelect` plays on the entity files.
 *
 * Nothing constructs this class. It exists to be read by the schema generator,
 * which is why every field is `readonly` and definitely-assigned.
 *
 * **The field-level `example:` values below are not what the standard error
 * responses display.** They are per-*field*, so Swagger UI assembling them into
 * one body produces a `404` carrying an authentication code and permission
 * `params` — a response this API cannot send, and it appeared identically under
 * every status. `ApiStandardErrors` therefore attaches a coherent per-status
 * example to each response, on the media type, and a media-type example
 * overrides anything the schema would have synthesised. These stay because they
 * are still a sane default for anything that `$ref`s this schema ad hoc; keep
 * them individually plausible, but do not expect an edit here to change what
 * the documented failures render. See `error-envelope.examples.ts`.
 */
export class ErrorEnvelope implements ApiErrorResponse {
  /**
   * Always `false`. The discriminant a client branches on before it looks at
   * anything else, including the status code.
   */
  @ApiProperty({ example: false })
  readonly success!: false;

  /** The HTTP status code, repeated in the body so one object carries it all. */
  @ApiProperty({ example: 404 })
  readonly statusCode!: number;

  /**
   * A single English explanation, or one entry per rejected field.
   *
   * The array form is the global `ValidationPipe`'s, preserved rather than
   * joined so a form can put each sentence back under its own input. It is
   * written for a developer reading a log and is free to be reworded at any
   * time — `errorCode` is the part a user interface translates against.
   */
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Public holiday not found',
  })
  readonly message!: string | string[];

  /**
   * A stable, machine-readable identifier for what went wrong.
   *
   * **Optional, and the absence is part of the contract.** Feature 033 added
   * codes without rewriting the thirty modules that came before it, so an
   * exception carrying no code produces this envelope with the key *absent*
   * rather than present and null. A client has to handle that by falling back
   * to `statusCode` and `message`, and that fallback is what made the migration
   * gradual. Where a code *is* present, renaming it is a breaking change.
   */
  @ApiPropertyOptional({
    enum: Object.values(ERROR_CODES),
    example: ERROR_CODES.AUTH_UNAUTHENTICATED,
  })
  readonly errorCode?: string;

  /**
   * Structured values for a translation to interpolate — `{ month: 9 }` behind
   * `"Luna {{month}} este deja blocată"`.
   *
   * Flat scalars only, and only ever present alongside an `errorCode`. Which
   * params a code carries is documented on the code itself, in
   * `error-codes.constants.ts`.
   */
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: {
      oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
    },
    example: { requiredPermissions: 'REPORTS.VIEW', mode: 'ALL' },
  })
  readonly params?: Record<string, string | number | boolean>;

  /** The request path that produced the error, for correlating with logs. */
  @ApiProperty({ example: '/api/v1/public-holidays/ckv1' })
  readonly path!: string;

  /** ISO-8601 UTC instant at which the error was rendered. */
  @ApiProperty({ example: '2026-08-12T08:36:11.816Z' })
  readonly timestamp!: string;
}
