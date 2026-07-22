/**
 * In-repo CodeGraph plugin: Litestar HTTP route handlers.
 *
 * Loaded as a Kerno built-in (no npm publish).
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { litestarResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-litestar',
  name: 'Kerno Litestar',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [litestarResolver.name],
  },
  resolvers: [litestarResolver],
};

export { litestarResolver };
export default plugin;
