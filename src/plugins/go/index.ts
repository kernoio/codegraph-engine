/**
 * In-repo CodeGraph plugin: Go HTTP routers (Kerno hardenings).
 *
 * Replaces the stock go resolver at runtime via FRAMEWORK_RESOLVERS
 * registration while keeping upstream `frameworks/go.ts` merge-clean.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { goResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-go',
  name: 'Kerno Go',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [goResolver.name],
  },
  resolvers: [goResolver],
};

export { goResolver };
export default plugin;
