/**
 * In-repo CodeGraph plugin: Symfony HTTP routes
 * (PHP attributes, legacy annotations, YAML/XML route tables).
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { symfonyResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-symfony',
  name: 'Kerno Symfony',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [symfonyResolver.name],
  },
  resolvers: [symfonyResolver],
};

export { symfonyResolver };
export default plugin;
