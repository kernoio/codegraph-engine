/**
 * In-repo CodeGraph plugin: AdonisJS HTTP routes.
 *
 * Loaded as a Kerno built-in (no npm publish).
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { adonisjsResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-adonisjs',
  name: 'Kerno AdonisJS',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [adonisjsResolver.name],
  },
  resolvers: [adonisjsResolver],
};

export { adonisjsResolver };
export default plugin;
