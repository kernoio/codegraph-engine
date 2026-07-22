/**
 * In-repo CodeGraph plugin: Koa (@koa/router / koa-router) HTTP routes.
 *
 * Loaded as a Kerno built-in (no npm publish).
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { koaResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-koa',
  name: 'Kerno Koa',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [koaResolver.name],
  },
  resolvers: [koaResolver],
};

export { koaResolver };
export default plugin;
