/**
 * In-repo CodeGraph plugin: Falcon (Python) `add_route` resource routing.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { falconResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-falcon',
  name: 'Kerno Falcon',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [falconResolver.name],
  },
  resolvers: [falconResolver],
};

export { falconResolver };
export default plugin;
