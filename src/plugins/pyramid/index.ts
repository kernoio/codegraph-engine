/**
 * In-repo CodeGraph plugin: Pyramid (Python) URL-dispatch routes.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { pyramidResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-pyramid',
  name: 'Kerno Pyramid Routes',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [pyramidResolver.name],
  },
  resolvers: [pyramidResolver],
};

export { pyramidResolver };
export default plugin;
