/**
 * Kerno in-repo framework plugins (not published to npm).
 *
 * Resolvers here are registered into FRAMEWORK_RESOLVERS at process start so
 * parse workers see the same detectors as the main thread. Lifecycle metadata
 * is also exposed as CodeGraphPlugin objects via getBuiltInPlugins().
 */

import type { CodeGraphPlugin } from '../plugin-system/api';
import type { FrameworkResolver } from '../resolution/types';
import tsoaPlugin, { tsoaResolver } from './tsoa';
import nextAppRouterPlugin, { nextAppRouterResolver } from './next-app-router';
import nestjsKernoPlugin, { nestjsKernoResolver } from './nestjs-kerno';
import goHttpPlugin, { goHttpResolver } from './go-http';
import phpHttpRoutesPlugin, { phpHttpRoutesResolver } from './php-http-routes';
import elysiaPlugin, { elysiaResolver } from './elysia';

const BUILTIN_PLUGINS: CodeGraphPlugin[] = [
  tsoaPlugin,
  nextAppRouterPlugin,
  nestjsKernoPlugin,
  goHttpPlugin,
  phpHttpRoutesPlugin,
  elysiaPlugin,
];

export function getBuiltInPlugins(): CodeGraphPlugin[] {
  return BUILTIN_PLUGINS;
}

export function getBuiltInPluginResolvers(): FrameworkResolver[] {
  return BUILTIN_PLUGINS.flatMap((p) => p.resolvers ?? []);
}

export {
  tsoaResolver,
  nextAppRouterResolver,
  nestjsKernoResolver,
  goHttpResolver,
  phpHttpRoutesResolver,
  elysiaResolver,
};
