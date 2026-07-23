/**
 * In-repo CodeGraph plugin: Ktor server routing DSL.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { ktorResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-ktor',
  name: 'Kerno Ktor',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [ktorResolver.name],
  },
  resolvers: [ktorResolver],
};

export { ktorResolver };
export default plugin;
