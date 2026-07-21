/**
 * In-repo CodeGraph plugin: NestJS (Kerno-enhanced route recall).
 *
 * Replaces stock `nestjs` resolver with fork hardenings (multi-path @Controller,
 * setGlobalPrefix, URI versioning, RouterModule) plus framework-generic gaps:
 * @ResolveField, custom *Resolver class decorators, @Version, { path } object args.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { nestjsKernoResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-nestjs',
  name: 'Kerno NestJS',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [nestjsKernoResolver.name],
  },
  resolvers: [nestjsKernoResolver],
};

export { nestjsKernoResolver };
export default plugin;
