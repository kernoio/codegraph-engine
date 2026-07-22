/**
 * In-repo CodeGraph plugin: Bottle (@route / @get/@post + Bottle() apps).
 *
 * Loaded as a Kerno built-in (no npm publish).
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { bottleResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-bottle',
  name: 'Kerno Bottle',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [bottleResolver.name],
  },
  resolvers: [bottleResolver],
};

export { bottleResolver };
export default plugin;
