/**
 * In-repo CodeGraph plugin: NestJS (Kerno hardenings).
 *
 * Replaces the stock nestjs resolver at runtime via FRAMEWORK_RESOLVERS
 * registration while keeping upstream `frameworks/nestjs.ts` merge-clean.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { nestjsResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-nestjs',
  name: 'Kerno NestJS',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [nestjsResolver.name],
  },
  resolvers: [nestjsResolver],
};

export { nestjsResolver };
export default plugin;
