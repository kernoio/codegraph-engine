/**
 * In-repo CodeGraph plugin: Next.js App Router `route.ts` HTTP handlers.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { nextAppRouterResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-next-app-router',
  name: 'Kerno Next.js App Router',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [nextAppRouterResolver.name],
  },
  resolvers: [nextAppRouterResolver],
};

export { nextAppRouterResolver };
export default plugin;
