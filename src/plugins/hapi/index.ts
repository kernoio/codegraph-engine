/**
 * In-repo CodeGraph plugin: Hapi HTTP routes.
 *
 * Loaded as a Kerno built-in (no npm publish).
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { hapiResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-hapi',
  name: 'Kerno Hapi',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [hapiResolver.name],
  },
  resolvers: [hapiResolver],
};

export { hapiResolver };
export default plugin;
