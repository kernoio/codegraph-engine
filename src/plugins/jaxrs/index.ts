/**
 * In-repo CodeGraph plugin: JAX-RS (@Path + @GET/@POST/…).
 *
 * Covers Quarkus, Jersey, RESTEasy, and Dropwizard — one annotation set.
 * Loaded as a Kerno built-in (no npm publish).
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { jaxrsResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-jaxrs',
  name: 'Kerno JAX-RS',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [jaxrsResolver.name],
  },
  resolvers: [jaxrsResolver],
};

export { jaxrsResolver };
export default plugin;
