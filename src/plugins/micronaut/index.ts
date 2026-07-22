/**
 * In-repo CodeGraph plugin: Micronaut HTTP controllers.
 *
 * Loaded as a Kerno built-in (no npm publish). External projects can also
 * point codegraph.json at this folder after a local path install.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { micronautResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-micronaut',
  name: 'Kerno Micronaut',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [micronautResolver.name],
  },
  resolvers: [micronautResolver],
};

export { micronautResolver };
export default plugin;
