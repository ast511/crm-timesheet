import type { AxiosRequestConfig } from 'axios';

import type { components, paths } from './generated/openapi';
import { http } from './http';

/**
 * The typed request layer: **generated types, our transport.**
 *
 * The types below are derived entirely from `generated/openapi.d.ts`, so a
 * renamed field or a removed route is a compile error in the screens that use
 * it. The transport is `http` — the application's own axios instance — so every
 * call carries the bearer token, meets the `401` seam, and fails as an
 * `ApiError`. Neither half is negotiable: types that are not generated drift,
 * and a transport that is not this instance skips the interceptors.
 *
 * ```ts
 * const health = await apiGet('/api/v1/health');
 * //    ^? { status: string; service: string }
 *
 * const page = await apiGet('/api/v1/departments', {
 *   query: { page: 1, limit: 20, sortBy: 'name', sortOrder: 'asc' },
 * });
 *
 * const one = await apiGet('/api/v1/departments/{id}', { path: { id } });
 * ```
 *
 * Paths are written **whole**, exactly as the contract spells them, `/api/v1`
 * included — see `src/lib/env.ts` for why the prefix is not hidden in the
 * axios `baseURL`.
 */

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Anything openapi-typescript emitted as a real operation. */
type OperationShape = { responses: Record<string, unknown> };

/** The operation object for one path and method, or `never` if it has none. */
export type OperationOf<P extends keyof paths, M extends HttpMethod> = paths[P][M] extends
  | infer Operation
  | undefined
  ? Operation extends OperationShape
    ? Operation
    : never
  : never;

/** Every path in the contract that defines the given method. */
export type ApiPath<M extends HttpMethod> = {
  [P in keyof paths]: [OperationOf<P, M>] extends [never] ? never : P;
}[keyof paths];

type JsonContent<T> = T extends { content: { 'application/json': infer Body } } ? Body : never;

type ResponsesOf<Operation> = Operation extends { responses: infer R } ? R : never;

/**
 * The success response. Only `200` and `201` occur in this contract — the API
 * has no `204`, because a handler that returns nothing still answers the
 * envelope with `data: null` (backend Feature 006).
 */
type SuccessPayload<Operation> = JsonContent<
  ResponsesOf<Operation>[Extract<200 | 201, keyof ResponsesOf<Operation>>]
>;

/**
 * Strips the `{ success, data }` envelope at the type level, mirroring what
 * {@link unwrapEnvelope} does at runtime, so the two cannot disagree.
 *
 * Anything that is not an envelope passes through unchanged — which is how the
 * report exports keep working, since a spreadsheet is sent as a file and the
 * interceptor chain has nothing to unwrap.
 */
type UnwrapEnvelope<T> = T extends { success: true; data: infer Data } ? Data : T;

/** What a call to this path and method resolves to. */
export type ApiResult<P extends keyof paths, M extends HttpMethod> = UnwrapEnvelope<
  SuccessPayload<OperationOf<P, M>>
>;

type ParametersOf<Operation> = Operation extends { parameters: infer Params } ? Params : never;

type QueryOf<Operation> = ParametersOf<Operation> extends { query?: infer Query }
  ? Exclude<Query, undefined>
  : never;

type PathParamsOf<Operation> = ParametersOf<Operation> extends { path?: infer Path }
  ? Exclude<Path, undefined>
  : never;

type BodyOf<Operation> = Operation extends { requestBody?: infer Body }
  ? JsonContent<Exclude<Body, undefined>>
  : never;

/**
 * Each of the three parts is present only when the operation has one, and
 * required only when the contract marks it required. So a path parameter cannot
 * be forgotten, and an endpoint whose filters are all optional does not force
 * an empty `query: {}` on its callers.
 */
type QueryPart<Operation> = [QueryOf<Operation>] extends [never]
  ? { query?: never }
  : ParametersOf<Operation> extends { query: unknown }
    ? { query: QueryOf<Operation> }
    : { query?: QueryOf<Operation> };

type PathPart<Operation> = [PathParamsOf<Operation>] extends [never]
  ? { path?: never }
  : { path: PathParamsOf<Operation> };

type BodyPart<Operation> = [BodyOf<Operation>] extends [never]
  ? { body?: never }
  : Operation extends { requestBody: unknown }
    ? { body: BodyOf<Operation> }
    : { body?: BodyOf<Operation> };

/** Axios options this helper models itself, and therefore does not accept twice. */
type ManagedAxiosOptions = 'method' | 'url' | 'params' | 'data' | 'signal' | 'baseURL';

export type RequestOptions<Operation> = PathPart<Operation> &
  QueryPart<Operation> &
  BodyPart<Operation> & {
    /** Wired to TanStack Query's signal so a superseded request is aborted. */
    signal?: AbortSignal;
    /**
     * Escape hatch for the rest of axios — `responseType: 'blob'` for a report
     * export, a per-call `timeout`, an extra header. It cannot reach the fields
     * above, which are the contract's job.
     */
    config?: Omit<AxiosRequestConfig, ManagedAxiosOptions>;
  };

type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K;
}[keyof T];

/**
 * Makes the options argument itself required when the operation has a required
 * part, and optional when it has none — so `apiGet('/api/v1/health')` needs no
 * second argument while `apiGet('/api/v1/departments/{id}')` will not compile
 * without one.
 */
type OptionsArg<Operation> = [RequiredKeys<RequestOptions<Operation>>] extends [never]
  ? [options?: RequestOptions<Operation>]
  : [options: RequestOptions<Operation>];

/** The loose shape the runtime works with, once the types have done their job. */
interface RuntimeOptions {
  path?: Record<string, string | number | boolean>;
  query?: Record<string, unknown>;
  body?: unknown;
  signal?: AbortSignal;
  config?: AxiosRequestConfig;
}

const PATH_PARAM_PATTERN = /\{([^}]+)\}/g;

const fillPathParams = (path: string, params: RuntimeOptions['path']): string =>
  params === undefined
    ? path
    : path.replace(PATH_PARAM_PATTERN, (_match, name: string) => {
        const value = params[name];

        if (value === undefined) {
          throw new Error(`Missing path parameter "${name}" for ${path}`);
        }

        return encodeURIComponent(String(value));
      });

/**
 * Unwraps `{ success: true, data }` **once, here**, so no call site does it and
 * no component re-implements it. Anything else — a file download, a body the
 * envelope never touched — is returned as it arrived.
 */
const unwrapEnvelope = (body: unknown): unknown =>
  typeof body === 'object' &&
  body !== null &&
  'success' in body &&
  (body as { success: unknown }).success === true &&
  'data' in body
    ? (body as { data: unknown }).data
    : body;

/**
 * Issues one request against the contract.
 *
 * Prefer the `apiGet` / `apiPost` / … wrappers below; this is what they call and
 * what a rarely-used method would use directly.
 */
export const apiRequest = async <M extends HttpMethod, P extends ApiPath<M>>(
  method: M,
  path: P,
  ...args: OptionsArg<OperationOf<P, M>>
): Promise<ApiResult<P, M>> => {
  const options = args[0] as RuntimeOptions | undefined;

  const response = await http.request({
    ...options?.config,
    method,
    url: fillPathParams(path as string, options?.path),
    params: options?.query,
    data: options?.body,
    signal: options?.signal,
  });

  return unwrapEnvelope(response.data) as ApiResult<P, M>;
};

export const apiGet = <P extends ApiPath<'get'>>(
  path: P,
  ...args: OptionsArg<OperationOf<P, 'get'>>
): Promise<ApiResult<P, 'get'>> => apiRequest('get', path, ...args);

export const apiPost = <P extends ApiPath<'post'>>(
  path: P,
  ...args: OptionsArg<OperationOf<P, 'post'>>
): Promise<ApiResult<P, 'post'>> => apiRequest('post', path, ...args);

export const apiPut = <P extends ApiPath<'put'>>(
  path: P,
  ...args: OptionsArg<OperationOf<P, 'put'>>
): Promise<ApiResult<P, 'put'>> => apiRequest('put', path, ...args);

export const apiPatch = <P extends ApiPath<'patch'>>(
  path: P,
  ...args: OptionsArg<OperationOf<P, 'patch'>>
): Promise<ApiResult<P, 'patch'>> => apiRequest('patch', path, ...args);

export const apiDelete = <P extends ApiPath<'delete'>>(
  path: P,
  ...args: OptionsArg<OperationOf<P, 'delete'>>
): Promise<ApiResult<P, 'delete'>> => apiRequest('delete', path, ...args);

/**
 * Page metadata, from the contract. Every paginated endpoint returns it and the
 * `DataTable` renders its controls from it.
 */
export type PaginationMeta = components['schemas']['PaginationMeta'];

/** A page of records, as `{ items, meta }` — the shape backend Feature 006 sends. */
export interface PaginatedResult<TItem> {
  items: TItem[];
  meta: PaginationMeta;
}
