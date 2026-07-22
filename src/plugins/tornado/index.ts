/**
 * In-repo CodeGraph plugin: Tornado (Application URLSpec route tables).
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { tornadoResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-tornado',
  name: 'Kerno Tornado',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [tornadoResolver.name],
  },
  resolvers: [tornadoResolver],
};

export { tornadoResolver };
export default plugin;
