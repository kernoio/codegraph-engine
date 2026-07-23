/**
 * Vert.x Web route discovery (Kerno in-repo plugin)
 *
 * Covers `router.get/post/...("/path").handler(...)`,
 * `router.route(HttpMethod.X, "/path")`, and same-file nested routers via
 * `mountSubRouter("/prefix", sub)` / `.route("/prefix/*").subRouter(sub)`.
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  UnresolvedRef,
  ResolvedRef,
  ResolutionContext,
  FrameworkExtractionResult,
} from '../types';
import { stripCommentsForRegex } from '../strip-comments';

const HTTP_VERBS = 'get|post|put|patch|delete|head|options' as const;

/** Middleware-only handlers — emit no route node (precision over recall). */
const MIDDLEWARE_HANDLER_RE =
  /\b(?:BodyHandler|StaticHandler|SessionHandler|CorsHandler|ResponseContentTypeHandler|RedirectAuthHandler|UserSessionHandler|LoggerHandler|TimeoutHandler|ErrorHandler|FaviconHandler|CSRFHandler|JWTAuthHandler|SockJSHandler)\s*\.\s*create\b/;

interface PendingRoute {
  routerVar: string;
  method: string;
  path: string;
  line: number;
  colLen: number;
  handlerName: string | null;
}

export const vertxWebResolver: FrameworkResolver = {
  name: 'vertx-web',
  languages: ['java', 'kotlin'],

  detect(context: ResolutionContext): boolean {
    for (const manifest of ['pom.xml', 'build.gradle', 'build.gradle.kts']) {
      const content = context.readFile(manifest);
      if (
        content &&
        (content.includes('vertx-web') ||
          content.includes('io.vertx:vertx-web') ||
          /io\.vertx['"]/.test(content))
      ) {
        return true;
      }
    }

    return context.getAllFiles().some((f) => {
      if (!f.endsWith('.java') && !f.endsWith('.kt')) return false;
      const content = context.readFile(f);
      if (!content) return false;
      return (
        /io\.vertx\.ext\.web\.Router\b/.test(content) ||
        /io\.vertx\.reactivex\.ext\.web\.Router\b/.test(content) ||
        /\bRouter\s*\.\s*router\s*\(/.test(content)
      );
    });
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    const candidates = context
      .getNodesByName(ref.referenceName)
      .filter((n) => n.kind === 'method' || n.kind === 'function');
    if (candidates.length === 0) return null;

    const sameFile = candidates.filter((n) => n.filePath === ref.filePath);
    const pick = sameFile[0] ?? candidates[0]!;
    return {
      original: ref,
      targetNodeId: pick.id,
      confidence: sameFile.length > 0 ? 0.9 : 0.75,
      resolvedBy: 'framework',
    };
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!filePath.endsWith('.java') && !filePath.endsWith('.kt')) {
      return { nodes: [], references: [] };
    }
    const now = Date.now();
    const lang = filePath.endsWith('.kt') ? 'kotlin' : 'java';
    const safe = stripCommentsForRegex(content, 'java');
    const pending = collectRoutes(safe);
    applySameFileMountPrefixes(safe, pending);

    const nodes: Node[] = [];
    const references: UnresolvedRef[] = [];
    const seen = new Set<string>();

    for (const route of pending) {
      const key = `${route.method} ${route.path}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const routeNode: Node = {
        id: `route:${filePath}:${route.line}:${route.method}:${route.path}`,
        kind: 'route',
        name: key,
        qualifiedName: `${filePath}::route:${route.method}:${route.path}`,
        filePath,
        startLine: route.line,
        endLine: route.line,
        startColumn: 0,
        endColumn: route.colLen,
        language: lang,
        updatedAt: now,
      };
      nodes.push(routeNode);

      if (route.handlerName) {
        references.push({
          fromNodeId: routeNode.id,
          referenceName: route.handlerName,
          referenceKind: 'references',
          line: route.line,
          column: 0,
          filePath,
          language: lang,
        });
      }
    }

    return { nodes, references };
  },
};

function collectRoutes(safe: string): PendingRoute[] {
  const pending: PendingRoute[] = [];

  // router.get("/path").produces(...).handler(...)
  const verbPathRe = new RegExp(
    `\\b(\\w+)\\.(${HTTP_VERBS})\\s*\\(\\s*"([^"]+)"\\s*\\)`,
    'gi'
  );
  let match: RegExpExecArray | null;
  while ((match = verbPathRe.exec(safe)) !== null) {
    const routerVar = match[1]!;
    const method = match[2]!.toUpperCase();
    const path = match[3]!;
    if (!path.startsWith('/')) continue;

    const after = safe.slice(match.index + match[0].length, match.index + match[0].length + 400);
    const handlerInfo = findHandler(after);
    if (!handlerInfo) continue;
    if (MIDDLEWARE_HANDLER_RE.test(handlerInfo.expr)) continue;

    pending.push({
      routerVar,
      method,
      path,
      line: lineAt(safe, match.index),
      colLen: match[0].length,
      handlerName: handlerInfo.name,
    });
  }

  // router.route(HttpMethod.POST, "/path").handler(...)
  const routeMethodRe =
    /\b(\w+)\.route\s*\(\s*HttpMethod\.(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*,\s*"([^"]+)"\s*\)/gi;
  while ((match = routeMethodRe.exec(safe)) !== null) {
    const routerVar = match[1]!;
    const method = match[2]!.toUpperCase();
    const path = match[3]!;
    if (!path.startsWith('/')) continue;

    const after = safe.slice(match.index + match[0].length, match.index + match[0].length + 400);
    const handlerInfo = findHandler(after);
    if (!handlerInfo) continue;
    if (MIDDLEWARE_HANDLER_RE.test(handlerInfo.expr)) continue;

    pending.push({
      routerVar,
      method,
      path,
      line: lineAt(safe, match.index),
      colLen: match[0].length,
      handlerName: handlerInfo.name,
    });
  }

  return pending;
}

/**
 * Same-file nested routers:
 *   router.mountSubRouter("/api", apiRouter);
 *   router.route("/api/*").subRouter(apiRouter);
 */
function applySameFileMountPrefixes(safe: string, pending: PendingRoute[]): void {
  const mounts = new Map<string, string>();

  const mountRe = /\b\w+\.mountSubRouter\s*\(\s*"([^"]+)"\s*,\s*(\w+)\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = mountRe.exec(safe)) !== null) {
    mounts.set(match[2]!, normalizeMountPrefix(match[1]!));
  }

  const subRouterRe =
    /\b\w+\.route\s*\(\s*"([^"]+)"\s*\)\s*(?:\.\s*\w+\s*\([^)]*\)\s*)*\.\s*subRouter\s*\(\s*(\w+)\s*\)/g;
  while ((match = subRouterRe.exec(safe)) !== null) {
    mounts.set(match[2]!, normalizeMountPrefix(match[1]!));
  }

  if (mounts.size === 0) return;

  for (const route of pending) {
    const prefix = mounts.get(route.routerVar);
    if (!prefix) continue;
    route.path = joinPaths(prefix, route.path);
  }
}

function findHandler(after: string): { expr: string; name: string | null } | null {
  // Allow chained .produces/.consumes/.order before .handler(
  const chain = after.match(
    /^(?:\s*\.\s*(?:produces|consumes|order)\s*\(\s*"[^"]*"\s*\))*\s*\.\s*handler\s*\(/
  );
  if (!chain) return null;
  // Only the first handler argument — do not scan past it into later statements
  // (a wide window would false-positive on JWTAuthHandler.create on the next route).
  const expr = readBalancedArg(after, chain[0].length);
  if (expr == null) return null;
  return { expr, name: extractHandlerName(expr) };
}

/** Read one top-level function-call argument starting at `start` (after the '('). */
function readBalancedArg(src: string, start: number): string | null {
  let depth = 1;
  let i = start;
  let inStr: '"' | "'" | null = null;
  while (i < src.length && depth > 0) {
    const ch = src[i]!;
    if (inStr) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      i++;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return src.slice(start, i).trim();
    }
    i++;
  }
  return null;
}

function extractHandlerName(expr: string): string | null {
  // this::indexHandler / ClassName::method
  const methodRef = expr.match(/(?:this|[A-Z]\w*)\s*::\s*(\w+)/);
  if (methodRef) return methodRef[1]!;

  // DemoHandlers.loginFormHandler(...) — skip factory calls; no stable symbol
  return null;
}

function normalizeMountPrefix(raw: string): string {
  // "/api/*" → "/api", "/productsAPI/*" → "/productsAPI", ".*\\.templ" skipped earlier
  let p = raw.replace(/\/\*$/, '').replace(/\*$/, '');
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p === '' ? '/' : p;
}

function joinPaths(prefix: string, path: string): string {
  if (prefix === '/' || prefix === '') return path;
  if (path === '/') return prefix;
  const left = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const right = path.startsWith('/') ? path : `/${path}`;
  return `${left}${right}`;
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}
