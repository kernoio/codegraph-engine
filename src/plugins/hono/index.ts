/**
 * In-repo CodeGraph plugin: Hono HTTP route detection.
 *
 * Covers app.get/post/…, chained verbs, app.on, basePath, and app.route()
 * mounts (same-file + cross-file).
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { honoResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-hono',
  name: 'Kerno Hono',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [honoResolver.name],
  },
  resolvers: [honoResolver],
};

export { honoResolver };
export default plugin;
