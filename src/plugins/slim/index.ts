/**
 * In-repo CodeGraph plugin: Slim Framework HTTP routes.
 *
 * Loaded as a Kerno built-in (no npm publish).
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { slimResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-slim',
  name: 'Kerno Slim',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [slimResolver.name],
  },
  resolvers: [slimResolver],
};

export { slimResolver };
export default plugin;
