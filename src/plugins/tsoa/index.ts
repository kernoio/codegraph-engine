/**
 * In-repo CodeGraph plugin: tsoa (@Route + HTTP method decorators).
 *
 * Loaded as a Kerno built-in (no npm publish). External projects can also
 * point codegraph.json at this folder after a local path install.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { tsoaResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-tsoa',
  name: 'Kerno tsoa',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [tsoaResolver.name],
  },
  resolvers: [tsoaResolver],
};

export { tsoaResolver };
export default plugin;
