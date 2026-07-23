/**
 * In-repo CodeGraph plugin: Sinatra + Grape HTTP routes (Ruby).
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { sinatraGrapeResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-sinatra-grape',
  name: 'Kerno Sinatra + Grape',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [sinatraGrapeResolver.name],
  },
  resolvers: [sinatraGrapeResolver],
};

export { sinatraGrapeResolver };
export default plugin;
