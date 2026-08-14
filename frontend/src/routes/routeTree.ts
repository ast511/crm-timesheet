import { landingRoute } from './landing.route';
import { rootRoute } from './root.route';
import { workspaceIndexRoute, workspaceRoute } from './workspace.route';

/**
 * The route tree, assembled by hand.
 *
 * **Code-based rather than file-based routing**, deliberately. File-based
 * routing needs the router's Vite plugin and a generated `routeTree.gen.ts`
 * committed alongside the source; this project already generates one large file
 * from the OpenAPI contract, and a second generator earning only a naming
 * convention is not worth the build step. Adding a route here is a file plus a
 * line, and the result is just as typed — `<Link to="/app">` is checked against
 * this tree either way.
 */
export const routeTree = rootRoute.addChildren([
  landingRoute,
  workspaceRoute.addChildren([workspaceIndexRoute]),
]);
