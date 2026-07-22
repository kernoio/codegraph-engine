/**
 * In-repo CodeGraph plugin: Elysia (Bun-native HTTP framework).
 *
 * Covers chained `.get()/.post()/…`, `.group()` prefixes (with optional guard),
 * `new Elysia({ prefix })`, and `.route(METHOD, path)`.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { elysiaResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-elysia',
  name: 'Kerno Elysia',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [elysiaResolver.name],
  },
  resolvers: [elysiaResolver],
};

export { elysiaResolver };
export default plugin;
