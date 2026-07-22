/**
 * In-repo CodeGraph plugin: Go HTTP routers (Gin, Echo, Chi, Fiber, gorilla/mux, net/http).
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { goHttpResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-go-http',
  name: 'Kerno Go HTTP',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [goHttpResolver.name],
  },
  resolvers: [goHttpResolver],
};

export { goHttpResolver };
export default plugin;
