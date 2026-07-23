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
} from '../types';
import {
  applyMuxRoutePrefixes,
  collectMuxRoutePrefixes,
  extractGoHttpRoutes,
} from './go-mux-routes';

const HANDLER_DIRS = ['handler', 'handlers', 'api', 'routes', 'controller', 'controllers'];
const SERVICE_DIRS = ['service', 'services', 'repository', 'store', 'pkg'];
const MIDDLEWARE_DIRS = ['middleware', 'middlewares'];
const MODEL_DIRS = ['model', 'models', 'entity', 'entities', 'domain', 'pkg'];
const SERVICE_KINDS = new Set(['struct', 'interface']);

export const goResolver: FrameworkResolver = {
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
    const prefixByField = new Map<string, string>();

    for (const filePath of context.getAllFiles()) {
      if (!filePath.endsWith('.go')) continue;
      const content = context.readFile(filePath);
      if (!content) continue;
      for (const [field, prefix] of collectMuxRoutePrefixes(content)) {
        prefixByField.set(field, prefix);
      }
    }

    const routes =
      context.iterateNodesByKind?.('route') != null
        ? Array.from(context.iterateNodesByKind!('route'))
        : context.getNodesByKind('route');

    return applyMuxRoutePrefixes(routes, prefixByField);
  },
};

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
