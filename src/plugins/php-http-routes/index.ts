/**
 * In-repo CodeGraph plugin: PHP HTTP routes (Laravel + Utopia / Appwrite).
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { phpHttpRoutesResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-php-http-routes',
  name: 'Kerno PHP HTTP Routes',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [phpHttpRoutesResolver.name],
  },
  resolvers: [phpHttpRoutesResolver],
};

export { phpHttpRoutesResolver };
export default plugin;
