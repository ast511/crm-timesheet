/**
 * Generates `src/api/generated/openapi.d.ts` from the backend's OpenAPI document.
 *
 * The backend (Feature 038) serves the document at `/api/docs-json` and it is the
 * frontend's contract: every request and response type in this application is
 * derived from it, never hand-written. Run this whenever the backend contract
 * changes.
 *
 *   npm run gen:api          # the backend must be running
 *
 * The URL comes from `VITE_OPENAPI_URL` (see `.env.example`), read through Vite's
 * own `loadEnv` so the script and the app resolve environment variables the same
 * way, from the same `.env` files.
 *
 * This is the one file in the project that is JavaScript rather than TypeScript:
 * it is build tooling run directly by Node before any compilation step exists,
 * not application code.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import openapiTS, { astToString } from 'openapi-typescript';
import { loadEnv } from 'vite';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = loadEnv('development', projectRoot, '');

const DEFAULT_OPENAPI_URL = 'http://localhost:3000/api/docs-json';
const url = env.VITE_OPENAPI_URL || DEFAULT_OPENAPI_URL;
const outFile = resolve(projectRoot, 'src/api/generated/openapi.d.ts');

const BANNER = `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Produced by \`npm run gen:api\` from the backend OpenAPI document.
 * Source: ${url}
 *
 * Every request and response type in this application is derived from here.
 * Editing this file by hand makes the frontend disagree with the API it talks
 * to, which is the exact failure the generator exists to prevent — change the
 * backend contract and regenerate instead.
 */

`;

console.log(`[gen:api] reading ${url}`);

let ast;
try {
  ast = await openapiTS(new URL(url));
} catch (error) {
  console.error(`[gen:api] could not read the OpenAPI document at ${url}`);
  console.error('[gen:api] is the backend running? (cd ../backend && npm run start:dev)');
  console.error(`[gen:api] SWAGGER_ENABLED must not be "false" — see backend/FEATURES/038.`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, BANNER + astToString(ast), 'utf8');

console.log(`[gen:api] wrote ${outFile}`);
