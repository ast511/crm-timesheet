import { ConfigService } from '@nestjs/config';

import { API_PREFIX } from './api.constants';
import { NodeEnvironment } from './env.validation';

/** Environment variable deciding whether the documentation is served. */
export const SWAGGER_ENABLED_KEY = 'SWAGGER_ENABLED';

/**
 * Path the interactive documentation is served at, without a leading slash —
 * the shape `SwaggerModule.setup` takes.
 *
 * Under {@link API_PREFIX} rather than at the root, because everything this
 * process answers is under `/api` and a reverse proxy routing on that prefix
 * would otherwise not forward the documentation at all. It is deliberately
 * *not* under `/api/v1`: the document describes every version the API serves,
 * so filing it under one of them would be a claim that stops being true the day
 * a `v2` controller appears.
 */
export const SWAGGER_DOCS_PATH = `${API_PREFIX}/docs`;

/** The same path as a route — `/api/docs`. */
export const SWAGGER_DOCS_ROUTE = `/${SWAGGER_DOCS_PATH}`;

/**
 * Where the raw OpenAPI document is served — `/api/docs-json`.
 *
 * `SwaggerModule` derives this from the UI path by appending `-json`, so it is
 * spelled here rather than configured: this constant follows that behaviour, it
 * does not decide it. It is the endpoint a frontend points a client generator
 * at, and the one an e2e test reads.
 */
export const SWAGGER_JSON_ROUTE = `${SWAGGER_DOCS_ROUTE}-json`;

/**
 * Whether this deployment serves its own API documentation.
 *
 * **Off in production unless somebody turns it on, on everywhere else.** The
 * document is a complete map of the API: every route, every field of every
 * payload, every permission a route requires, and a form that submits real
 * requests against the live service. None of that is a vulnerability by itself
 * — the routes are all still authenticated and rate limited — but it is
 * reconnaissance handed over for free, and there is no reason a production
 * deployment has to hand it over by accident.
 *
 * The gate is a **deliberate default rather than a hard rule**, because the
 * legitimate case for documentation in production is real: an internal
 * deployment behind a VPN, or a staging environment that a frontend team codes
 * a client against. `SWAGGER_ENABLED=true` is how that is said, and saying it
 * is the point — the exposure is then a decision somebody made rather than one
 * nobody noticed.
 *
 * Derived from `NODE_ENV` when the variable is unset, so a developer machine
 * and a CI run get the documentation with nothing configured, which is the
 * arrangement `SECURITY_HSTS_ENABLED` and `NOTIFICATION_SCHEDULER_ENABLED`
 * both use: the safe value and "not set" are the same thing at the one place
 * that reads them.
 */
export function isSwaggerEnabled(configService: ConfigService): boolean {
  const flag = readOptionalFlag(configService.get(SWAGGER_ENABLED_KEY));

  if (flag !== undefined) {
    return flag;
  }

  return configService.get<string>('NODE_ENV') !== NodeEnvironment.Production;
}

/**
 * Reads a three-state toggle: `true`, `false`, or "the operator said nothing".
 *
 * `env.validation.ts` converts the variable to a real boolean for the running
 * application; a spec building a bare `ConfigService`, and a `.env` read
 * without that contract, hand over the string. Only the two exact spellings
 * count — anything else is treated as unset and falls through to the `NODE_ENV`
 * default, which fails in the closed direction on a production deployment.
 */
function readOptionalFlag(value: unknown): boolean | undefined {
  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return undefined;
}
