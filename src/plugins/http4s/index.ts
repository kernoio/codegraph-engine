/**
 * In-repo CodeGraph plugin: http4s (Scala HttpRoutes / AuthedRoutes DSL).
 *
 * Loaded as a Kerno built-in (no npm publish). External projects can also
 * point codegraph.json at this folder after a local path install.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { http4sResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-http4s',
  name: 'Kerno http4s',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [http4sResolver.name],
  },
  resolvers: [http4sResolver],
};

export { http4sResolver };
export default plugin;
