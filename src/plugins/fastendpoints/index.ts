/**
 * In-repo CodeGraph plugin: FastEndpoints (Configure() + Group prefixes).
 *
 * Loaded as a Kerno built-in (no npm publish).
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { fastEndpointsResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-fastendpoints',
  name: 'Kerno FastEndpoints',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [fastEndpointsResolver.name],
  },
  resolvers: [fastEndpointsResolver],
};

export { fastEndpointsResolver };
export default plugin;
