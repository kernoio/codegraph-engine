/**
 * In-repo CodeGraph plugin: Next.js App Router `route.ts` HTTP handlers.
 *
 * Endpoint benchmarks (SCIP parity) must count HTTP handlers only — see
 * `isNextHttpRouteHandler` and `route-path.ts` for the page-vs-handler rule.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { nextAppRouterResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-next-app-router',
  name: 'Kerno Next.js App Router',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [nextAppRouterResolver.name],
  },
  resolvers: [nextAppRouterResolver],
};

export { nextAppRouterResolver };
export {
  filePathToAppRoute,
  isNextHttpRouteHandler,
  isNextPageRoute,
  NEXT_ROUTE_KIND_HTTP,
  NEXT_ROUTE_KIND_PAGE,
} from './route-path';
export default plugin;
