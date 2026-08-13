import { HttpStatus, Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import {
  ReferenceObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

import { PaginationMeta } from '../interfaces/pagination.interface';

/** What a documented success response says, beyond its schema. */
interface EnvelopeOptions {
  /** One line about what the payload *is*, when the type name is not enough. */
  description?: string;
  /** Overrides the status code. Defaults to 200, or 201 for `ApiCreated…`. */
  status?: HttpStatus;
}

/**
 * The success half of the response contract, as documentation.
 *
 * `ResponseInterceptor` wraps **every** successful body in
 * `{ success: true, data }`, so a handler's return type is never what a client
 * receives. Documenting `@ApiOkResponse({ type: DepartmentEntity })` would
 * therefore describe a body this API has never sent — the single most likely
 * way for generated documentation to be confidently wrong, because it looks
 * right and matches the handler signature.
 *
 * These decorators exist so the wrapping is applied to the documentation in the
 * one place it is applied to the responses. A controller says what the payload
 * is; the envelope is added here, exactly as the interceptor adds it there.
 *
 * Four shapes cover every endpoint in this application:
 *
 * | Helper | `data` |
 * | --- | --- |
 * | {@link ApiOkEnvelope} / {@link ApiCreatedEnvelope} | one object |
 * | {@link ApiOkArrayEnvelope} | a bare array |
 * | {@link ApiOkPageEnvelope} | `{ items, meta }` — a `PaginatedResult` |
 * | {@link ApiOkNullEnvelope} | `null`, for a handler that returns nothing |
 *
 * The fifth case is deliberately not an envelope at all:
 * {@link ApiOkFileResponse}, for the report exports that return a
 * `StreamableFile` and are the one carve-out `ResponseInterceptor` makes.
 */

/** `200` carrying a single object. */
export function ApiOkEnvelope<T>(
  type: Type<T>,
  options: EnvelopeOptions = {},
): MethodDecorator & ClassDecorator {
  return envelopeResponse(
    { $ref: getSchemaPath(type) },
    [type],
    options.status ?? HttpStatus.OK,
    options.description,
  );
}

/** `201` carrying the object that was created. */
export function ApiCreatedEnvelope<T>(
  type: Type<T>,
  options: EnvelopeOptions = {},
): MethodDecorator & ClassDecorator {
  return envelopeResponse(
    { $ref: getSchemaPath(type) },
    [type],
    options.status ?? HttpStatus.CREATED,
    options.description,
  );
}

/**
 * `200` carrying a bare array.
 *
 * The unpaginated collections — a year of public-holiday occurrences, the
 * approval-email list — where the whole set is small and bounded by something
 * other than a page size.
 */
export function ApiOkArrayEnvelope<T>(
  type: Type<T>,
  options: EnvelopeOptions = {},
): MethodDecorator & ClassDecorator {
  return envelopeResponse(
    { type: 'array', items: { $ref: getSchemaPath(type) } },
    [type],
    options.status ?? HttpStatus.OK,
    options.description,
  );
}

/**
 * `200` carrying a page — `{ items, meta }`, the shape `buildPaginatedResult`
 * produces and `PaginatedResult<T>` names.
 *
 * `meta` is referenced rather than inlined, so the six pagination fields are
 * one schema in the document instead of being repeated on each of the eighteen
 * paginated endpoints.
 */
export function ApiOkPageEnvelope<T>(
  type: Type<T>,
  options: EnvelopeOptions = {},
): MethodDecorator & ClassDecorator {
  return envelopeResponse(
    {
      type: 'object',
      required: ['items', 'meta'],
      properties: {
        items: { type: 'array', items: { $ref: getSchemaPath(type) } },
        meta: { $ref: getSchemaPath(PaginationMeta) },
      },
    },
    [type, PaginationMeta],
    options.status ?? HttpStatus.OK,
    options.description,
  );
}

/**
 * `200` with `data: null` — the answer to a delete, a logout, an activation.
 *
 * This project deliberately does not use `204`: a 204 carries no body, which
 * would make those the only endpoints whose response is not the envelope, and a
 * client should read the same two fields whatever it called.
 */
export function ApiOkNullEnvelope(
  options: EnvelopeOptions = {},
): MethodDecorator & ClassDecorator {
  return envelopeResponse(
    {
      nullable: true,
      example: null,
      description: 'Always `null` — the action succeeded and returns no body.',
    },
    [],
    options.status ?? HttpStatus.OK,
    options.description,
  );
}

/**
 * `200` carrying a file, and **not** an envelope.
 *
 * The report exports return a `StreamableFile`, which `ResponseInterceptor`
 * passes through untouched: there is no reading of `{ success, data }` that can
 * contain a spreadsheet. The documentation has to make the same exception or it
 * would promise JSON on the one route that never sends any.
 */
export function ApiOkFileResponse(options: {
  description: string;
  mediaType: string;
}): MethodDecorator & ClassDecorator {
  return ApiResponse({
    status: HttpStatus.OK,
    description: options.description,
    content: {
      [options.mediaType]: { schema: { type: 'string', format: 'binary' } },
    },
    headers: {
      'Content-Disposition': {
        description:
          'Carries the generated filename, e.g. `attachment; filename="raport-2026-08.xlsx"`.',
        schema: { type: 'string' },
      },
    },
  });
}

/**
 * Builds one documented success response around a `data` schema.
 *
 * `ApiExtraModels` is what puts the referenced classes into
 * `components.schemas`. Without it a `$ref` written by hand points at a schema
 * the generator was never told to emit, and the document validates as a set of
 * dangling references — which Swagger UI renders as an empty model rather than
 * as an error, so it is worth knowing this call is load-bearing.
 */
function envelopeResponse(
  data: SchemaObject | ReferenceObject,
  models: Type<unknown>[],
  status: HttpStatus,
  description?: string,
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(...models),
    ApiResponse({
      status,
      description,
      schema: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: {
            type: 'boolean',
            enum: [true],
            description:
              'Always `true`. The discriminant a client reads before anything else.',
          },
          data,
        },
      },
    }),
  );
}
