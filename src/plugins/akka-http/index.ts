/**
 * In-repo CodeGraph plugin: Akka HTTP / Pekko HTTP Scala Routing DSL.
 */

import type { CodeGraphPlugin } from '../../plugin-system/api';
import { akkaHttpResolver } from './resolver';

const plugin: CodeGraphPlugin = {
  id: 'kerno-akka-http',
  name: 'Kerno Akka HTTP / Pekko HTTP',
  version: '1.0.0',
  type: 'framework-resolver',
  provides: {
    frameworkResolvers: [akkaHttpResolver.name],
  },
  resolvers: [akkaHttpResolver],
};

export { akkaHttpResolver };
export default plugin;
