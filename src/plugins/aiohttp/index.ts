/**
 * In-repo CodeGraph plugin: aiohttp HTTP routes.
 *
 * Loaded as a Kerno built-in (no npm publish). External projects can also
 * point codegraph.json at this folder after a local path install.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { aiohttpResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-aiohttp',
  name: 'Kerno aiohttp',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [aiohttpResolver.name],
  },
  resolvers: [aiohttpResolver],
};

export { aiohttpResolver };
export default plugin;
