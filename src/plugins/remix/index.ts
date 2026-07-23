/**
 * In-repo CodeGraph plugin: Remix / React Router v7 framework-mode routes.
 *
 * Detects `loader`/`action` HTTP handlers from file-convention routes and
 * rewrites paths from `app/routes.ts` (`route` / `index` / `prefix` / `layout`).
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { remixResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-remix',
  name: 'Kerno Remix / React Router Framework',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [remixResolver.name],
  },
  resolvers: [remixResolver],
};

export { remixResolver };
export {
  filePathToRemixRoute,
  flatRouteIdToPath,
  normalizeRoutePath,
  joinRoutePaths,
} from './route-path';
export {
  parseRoutesConfig,
  isRoutesConfigFile,
  resolveRouteModulePath,
} from './routes-config';
export default plugin;
