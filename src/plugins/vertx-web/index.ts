/**
 * In-repo CodeGraph plugin: Vert.x Web HTTP routers.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { vertxWebResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-vertx-web',
  name: 'Kerno Vert.x Web',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [vertxWebResolver.name],
  },
  resolvers: [vertxWebResolver],
};

export { vertxWebResolver };
export default plugin;
