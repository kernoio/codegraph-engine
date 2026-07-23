/**
 * In-repo CodeGraph plugin: Fastify HTTP routes.
 *
 * Loaded as a Kerno built-in (no npm publish).
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { fastifyResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-fastify',
  name: 'Kerno Fastify',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [fastifyResolver.name],
  },
  resolvers: [fastifyResolver],
};

export { fastifyResolver };
export default plugin;
