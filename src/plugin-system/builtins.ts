/**
 * Always-on Kerno built-in plugins. Stock upstream resolvers remain in
 * FRAMEWORK_RESOLVERS; these plugins add Kerno P0 detectors (and prove the
 * plugin registration path). External packages listed in codegraph.json
 * `plugins` are loaded separately.
 */

import type { CodeGraphPlugin } from './api';
import { tsoaResolver } from '../resolution/frameworks/tsoa';

function wrap(
  id: string,
  name: string,
  resolvers: NonNullable<CodeGraphPlugin['resolvers']>
): CodeGraphPlugin {
  return {
    id,
    name,
    version: '1.0.0',
    type: 'framework-resolver',
    provides: {
      frameworkResolvers: resolvers.map((r) => r.name),
    },
    resolvers,
  };
}

export function getBuiltInPlugins(): CodeGraphPlugin[] {
  return [wrap('kerno-tsoa', 'Kerno tsoa', [tsoaResolver])];
}
