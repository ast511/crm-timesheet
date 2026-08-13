/**
 * Runs the `@nestjs/swagger` CLI plugin inside Jest.
 *
 * ## Why this file exists
 *
 * The plugin is a TypeScript AST transformer. `nest build` loads it from
 * `nest-cli.json` and applies it while compiling, which is how DTO, entity and
 * controller metadata gets generated for the running server. Jest does not go
 * through `nest build` — it compiles each file with `ts-jest` — so without this
 * the plugin never runs in a test.
 *
 * That divergence would be worse than missing coverage. The specs would
 * generate an OpenAPI document whose schemas are nearly empty while the
 * deployed one is complete, and the assertion that matters most — that no
 * `passwordHash` or token hash appears anywhere in the schemas — would pass
 * because there were barely any schemas to look at. A test that cannot fail is
 * worse than no test.
 *
 * ## Why it is JavaScript, in a TypeScript-only project
 *
 * Jest `require`s a transformer directly, before any TypeScript compilation
 * exists to have transformed it. `ts-jest` can compile a `.ts` transformer, but
 * only by shelling out to `esbuild`, which would mean taking a build dependency
 * on a native binary so that twenty lines of adapter could be written in
 * another language. This is the one file in the backend that is not TypeScript,
 * and it is tooling rather than application code.
 *
 * ## Why it also holds the options
 *
 * Both Jest configurations point here, so the plugin options are written once
 * for the two of them instead of being pasted into `package.json` and
 * `test/jest-e2e.json` separately. They still have to match `nest-cli.json`,
 * which is JSON and cannot require this file — so `openapi.e2e-spec.ts` asserts
 * the properties these options are responsible for (descriptions taken from
 * JSDoc, `.schema.ts` classes present), and a divergence fails the suite rather
 * than quietly producing two different documents.
 */

const swaggerPlugin = require('@nestjs/swagger/plugin');

/**
 * Kept identical to `compilerOptions.plugins[0].options` in `nest-cli.json`.
 *
 * `dtoFileNameSuffix` names every file the schema generator should look at:
 * `.dto.ts` for requests, `.entity.ts` for responses, `.schema.ts` for the
 * documentation-only classes such as the error envelope, and `.interface.ts`
 * for the single class living among the shared interfaces — `PaginationMeta`.
 *
 * `introspectComments` is what turns this project's JSDoc into field
 * descriptions, which is most of the value here: the DTOs already explain why
 * each field exists, and the alternative is retyping those sentences into
 * `@ApiProperty({ description })` and letting the two drift.
 */
const options = {
  dtoFileNameSuffix: ['.dto.ts', '.entity.ts', '.schema.ts', '.interface.ts'],
  controllerFileNameSuffix: ['.controller.ts'],
  introspectComments: true,
  classValidatorShim: true,
};

/** Bumping this invalidates ts-jest's compilation cache. */
const version = 1;

const name = 'nestjs-swagger-plugin';

/**
 * ts-jest hands over its compiler instance; the plugin needs the `ts.Program`
 * off it to resolve types across files.
 */
function factory(compilerInstance) {
  return swaggerPlugin.before(options, compilerInstance.program);
}

module.exports = { name, version, factory, options };
