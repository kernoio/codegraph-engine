/**
 * Go HTTP Framework Resolver (Kerno in-repo plugin)
 *
 * Gin, Echo, Chi, Fiber, net/http, and gorilla/mux (including subrouter
 * `.Handle("", h).Methods(...)` and Fiber/Gin nested `Group` / `Route` prefixes).
 * Cross-file mux prefix merging runs in postExtract (mattermost api4 pattern).
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  UnresolvedRef,
  ResolvedRef,
  ResolutionContext,
} from '../../resolution/types';
import {
  collectGoGroupFnPrefixes,
  collectGoMountPrefixes,
  collectGoStringConsts,
  collectMuxRoutePrefixes,
  extractGoHttpRoutes,
  finalizeGoRouteNames,
  overlayGoRoutePaths,
  preferMuxPrefix,
  readGoGroupFn,
} from './mux-routes';

const HANDLER_DIRS = ['handler', 'handlers', 'api', 'routes', 'controller', 'controllers'];
const SERVICE_DIRS = ['service', 'services', 'repository', 'store', 'pkg'];
const MIDDLEWARE_DIRS = ['middleware', 'middlewares'];
const MODEL_DIRS = ['model', 'models', 'entity', 'entities', 'domain', 'pkg'];
const SERVICE_KINDS = new Set(['struct', 'interface']);

export const goHttpResolver: FrameworkResolver = {
  name: 'go',
  languages: ['go'],

  detect(context: ResolutionContext): boolean {
    const goMod = context.readFile('go.mod');
    if (goMod) return true;
    return context.getAllFiles().some((f) => f.endsWith('.go'));
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    if (ref.referenceName.endsWith('Handler') || ref.referenceName.startsWith('Handle')) {
      const result = resolveByNameAndKind(ref.referenceName, 'function', HANDLER_DIRS, context);
      if (result) {
        return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
      }
    }

    if (
      ref.referenceName.endsWith('Service') ||
      ref.referenceName.endsWith('Repository') ||
      ref.referenceName.endsWith('Store')
    ) {
      const result = resolveByNameAndKind(ref.referenceName, null, SERVICE_DIRS, context, SERVICE_KINDS);
      if (result) {
        return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
      }
    }

    if (
      ref.referenceName.endsWith('Middleware') ||
      ref.referenceName.startsWith('Auth') ||
      ref.referenceName.startsWith('Log')
    ) {
      const result = resolveByNameAndKind(ref.referenceName, 'function', MIDDLEWARE_DIRS, context);
      if (result) {
        return { original: ref, targetNodeId: result, confidence: 0.75, resolvedBy: 'framework' };
      }
    }

    if (/^[A-Z][a-zA-Z]+$/.test(ref.referenceName)) {
      const result = resolveByNameAndKind(ref.referenceName, 'struct', MODEL_DIRS, context);
      if (result) {
        return { original: ref, targetNodeId: result, confidence: 0.7, resolvedBy: 'framework' };
      }
    }

    return null;
  },

  extract(filePath, content) {
    return extractGoHttpRoutes(filePath, content);
  },

  postExtract(context: ResolutionContext): Node[] {
    const goFiles: Array<{ filePath: string; content: string }> = [];

    for (const filePath of context.getAllFiles()) {
      if (!filePath.endsWith('.go')) continue;
      const content = context.readFile(filePath);
      if (!content) continue;
      goFiles.push({ filePath, content });
    }

    const consts = new Map<string, string>();
    for (const file of goFiles) {
      for (const [key, value] of collectGoStringConsts(file.content)) {
        if (!consts.has(key)) consts.set(key, value);
      }
    }

    const routes =
      context.iterateNodesByKind?.('route') != null
        ? Array.from(context.iterateNodesByKind!('route'))
        : context.getNodesByKind('route');
    const working = routes.map((route) => ({ ...route }));
    overlayGoRoutePaths(working, goFiles, consts);

    const wanted = new Map<string, { name: string; paramIndex: number }>();
    for (const route of working) {
      const groupFn = readGoGroupFn(route.qualifiedName);
      if (groupFn) wanted.set(groupFn.key, { name: groupFn.name, paramIndex: groupFn.paramIndex });
    }
    const groupFnPrefixes = collectGoGroupFnPrefixes(goFiles, wanted, consts);

    const prefixByField = new Map<string, string>();
    for (const file of goFiles) {
      for (const [field, prefix] of collectMuxRoutePrefixes(file.content, consts)) {
        prefixByField.set(field, preferMuxPrefix(prefixByField.get(field), prefix));
      }
    }

    const modulePath = readGoModulePath(context.readFile('go.mod'));
    const mounts = collectGoMountPrefixes(goFiles, modulePath);
    const finalized = finalizeGoRouteNames(working, prefixByField, mounts, groupFnPrefixes);
    const byId = new Map(working.map((route) => [route.id, route]));
    for (const update of finalized) byId.set(update.id, update);

    const originals = new Map(routes.map((route) => [route.id, route]));
    const updates: Node[] = [];
    for (const [id, next] of byId) {
      const original = originals.get(id);
      if (!original) continue;
      if (next.name === original.name && next.qualifiedName === original.qualifiedName) continue;
      updates.push({ ...original, name: next.name, qualifiedName: next.qualifiedName });
    }
    return updates;
  },
};

function readGoModulePath(goMod: string | null): string | null {
  if (!goMod) return null;
  const match = goMod.match(/^\s*module\s+(\S+)/m);
  return match ? match[1]! : null;
}

function resolveByNameAndKind(
  name: string,
  kind: string | null,
  preferredDirs: string[],
  context: ResolutionContext,
  kinds?: Set<string>
): string | null {
  const candidates = context.getNodesByName(name);
  if (candidates.length === 0) return null;

  const kindFiltered = candidates.filter((n) => {
    if (kinds) return kinds.has(n.kind);
    if (kind) return n.kind === kind;
    return true;
  });
  if (kindFiltered.length === 0) return null;

  const preferred = kindFiltered.filter((n) =>
    preferredDirs.some((d) => n.filePath.includes(`/${d}/`))
  );
  if (preferred.length > 0) return preferred[0]!.id;
  return kindFiltered[0]!.id;
}
