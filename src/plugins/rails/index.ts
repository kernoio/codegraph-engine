/**
 * In-repo CodeGraph plugin: Ruby on Rails routes.
 *
 * Replaces the stock `rails` resolver. `only:` / `except:` percent-literals,
 * the `path:` option, literal `#{interpolation}`, and `scope` / `namespace`
 * prefixes are applied so the recorded method + path is one Rails would serve.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { railsResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-rails',
  name: 'Kerno Rails',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [railsResolver.name],
  },
  resolvers: [railsResolver],
};

export { railsResolver };
export default plugin;
