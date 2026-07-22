/**
 * In-repo CodeGraph plugin: Sanic HTTP routes.
 *
 * Loaded as a Kerno built-in (no npm publish). External projects can also
 * point codegraph.json at this folder after a local path install.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { sanicResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-sanic',
  name: 'Kerno Sanic',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [sanicResolver.name],
  },
  resolvers: [sanicResolver],
};

export { sanicResolver };
export default plugin;
