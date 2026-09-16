/**
 * In-repo CodeGraph plugin: Django + Django REST framework URL routing.
 *
 * Replaces stock `django` resolver with include()/re_path prefix composition
 * (postExtract) and ViewSet detection that does not require a *View/*ViewSet
 * class name.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { djangoResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-django',
  name: 'Kerno Django',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [djangoResolver.name],
  },
  resolvers: [djangoResolver],
};

export { djangoResolver };
export default plugin;
