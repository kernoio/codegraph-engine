/**
 * Go HTTP route extraction — Gin, Echo, Chi, Fiber, net/http, gorilla/mux.
 *
 * Kerno plugin: gorilla/mux subrouter `.Handle("", h).Methods(http.MethodPost)`,
 * cross-file PathPrefix / Routes-struct prefix merging (issue #7), and Fiber/Gin
 * Group / Route callback prefixes with nested routers (issue #27).
 */

import { Node } from '../../types';
import { UnresolvedRef } from '../types';
import { stripCommentsForRegex } from '../strip-comments';

/** Marker in route qualifiedName holding the mux subrouter field for postExtract. */
export const GO_MUX_RECEIVER_MARKER = '::@mux:';

export interface GoRouteExtractResult {
  nodes: Node[];
  references: UnresolvedRef[];
}

/** Extract route nodes from a Go source file. */
export function extractGoHttpRoutes(filePath: string, content: string): GoRouteExtractResult {
  if (!filePath.endsWith('.go')) return { nodes: [], references: [] };
  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();
  const safe = stripCommentsForRegex(content, 'go');
  const groupPrefixes = collectGroupVarPrefixes(safe);

  const routeHeadRe =
    /(\b[\w.]+)\.(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|CONNECT|TRACE|Get|Post|Put|Patch|Delete|Options|Head|Connect|Trace|All|Handle|HandleFunc)\s*\(\s*"([^"]*)"\s*,\s*/g;

  let head: RegExpExecArray | null;
  while ((head = routeHeadRe.exec(safe)) !== null) {
    const receiver = head[1]!;
    const rawMethod = head[2]!;
    const routePath = head[3]!;
    const handlerStart = head.index + head[0].length;
    const { args, end: argsEnd } = scanCallArgs(safe, handlerStart);
    if (args.length === 0) continue;
    const handlerExpr = args[args.length - 1]!;
    if (isStaticFileHandler(handlerExpr)) continue;

    let end = argsEnd;
    let chainedMethod: string | null = null;
    const closeParen = safe.slice(end).match(/^\s*\)/);
    if (closeParen) end += closeParen[0].length;
    const methodsMatch = safe.slice(end).match(
      /^\s*\.\s*Methods\s*\(\s*(?:http\.Method(Post|Get|Put|Patch|Delete|Head|Options|Connect|Trace)|"([A-Z]+)"|\[\]string\{([^}]*)\})\s*\)/
    );
    if (methodsMatch) {
      chainedMethod =
        methodsMatch[1]?.toUpperCase() ??
        methodsMatch[2] ??
        parseMethodList(methodsMatch[3])[0] ??
        null;
      end += methodsMatch[0].length;
    }

    const methodPrefix = matchGo122MethodPattern(routePath, rawMethod);
    const isHandle = rawMethod === 'Handle' || rawMethod === 'HandleFunc';
    const isAll = rawMethod === 'All';
    const receiverLeaf = receiverLeafName(receiver);
    const groupPrefix = groupPrefixes.get(receiverLeaf) ?? null;

    if (!routePath.startsWith('/') && routePath !== '' && !methodPrefix && !groupPrefix) continue;
    if (routePath === '' && !isHandle && !groupPrefix) continue;

    const line = safe.slice(0, head.index).split('\n').length;
    let path = methodPrefix ? routePath.slice(methodPrefix.length).trimStart() : routePath;
    if (groupPrefix) path = joinGoPath(groupPrefix, path || '/');
    path = normalizeGoRoutePath(path);

    const method = methodPrefix
      ? methodPrefix
      : chainedMethod
        ? chainedMethod
        : isHandle || isAll
          ? 'ANY'
          : rawMethod.toUpperCase();

    const muxField = extractMuxReceiverField(receiver);
    addGoRoute(
      nodes,
      references,
      filePath,
      line,
      method,
      path,
      end - head.index,
      handlerExpr,
      muxField,
      now
    );
  }

  // Fiber / Chi-style: r.Add([]string{"GET","POST"}, "/path", handler)
  const addCallRe =
    /\b([\w.]+)\.Add\s*\(\s*\[\]string\{([^}]+)\}\s*,\s*"([^"]+)"\s*,\s*/g;
  let addMatch: RegExpExecArray | null;
  while ((addMatch = addCallRe.exec(safe)) !== null) {
    const receiver = addMatch[1]!;
    const methods = parseMethodList(addMatch[2]!);
    const routePath = addMatch[3]!;
    const handlerStart = addMatch.index + addMatch[0].length;
    const { args, end: argsEnd } = scanCallArgs(safe, handlerStart);
    if (args.length === 0 || methods.length === 0) continue;
    const handlerExpr = args[args.length - 1]!;
    if (isStaticFileHandler(handlerExpr)) continue;

    let end = argsEnd;
    const closeParen = safe.slice(end).match(/^\s*\)/);
    if (closeParen) end += closeParen[0].length;

    const receiverLeaf = receiverLeafName(receiver);
    const groupPrefix = groupPrefixes.get(receiverLeaf) ?? null;
    if (!routePath.startsWith('/') && !groupPrefix) continue;

    let path = groupPrefix ? joinGoPath(groupPrefix, routePath) : routePath;
    path = normalizeGoRoutePath(path);
    const line = safe.slice(0, addMatch.index).split('\n').length;
    for (const method of methods) {
      addGoRoute(
        nodes,
        references,
        filePath,
        line,
        method,
        path,
        end - addMatch.index,
        handlerExpr,
        null,
        now
      );
    }
  }

  // Chi / gorilla: r.Method("GET", "/path", handler)
  const methodCallRe =
    /\b([\w.]+)\.Method(?:s)?\s*\(\s*(?:\[\]string\{([^}]*)\}|"([A-Z]+)")\s*,\s*"([^"]+)"\s*,\s*([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = methodCallRe.exec(safe)) !== null) {
    const receiver = match[1]!;
    const methodsRaw = match[2] ?? match[3] ?? '';
    const routePath = match[4]!;
    const handlerExpr = match[5]!;
    const receiverLeaf = receiverLeafName(receiver);
    const groupPrefix = groupPrefixes.get(receiverLeaf) ?? null;
    if (!routePath.startsWith('/') && !groupPrefix) continue;
    const methods = methodsRaw.includes('"')
      ? Array.from(methodsRaw.matchAll(/"([A-Z]+)"/g)).map((m) => m[1]!)
      : methodsRaw
        ? [methodsRaw]
        : ['ANY'];
    let path = groupPrefix ? joinGoPath(groupPrefix, routePath) : routePath;
    path = normalizeGoRoutePath(path);
    const line = safe.slice(0, match.index).split('\n').length;
    for (const method of methods.length > 0 ? methods : ['ANY']) {
      addGoRoute(
        nodes,
        references,
        filePath,
        line,
        method,
        path,
        match[0].length,
        handlerExpr,
        null,
        now
      );
    }
  }

  // Same-file mux PathPrefix stacking for fragment-only ANY routes.
  // Group/Route prefixes are applied via collectGroupVarPrefixes above — not here.
  const prefixes = collectGoPathPrefixes(safe);
  if (prefixes.length > 0) {
    for (const node of nodes) {
      if (!node.name.startsWith('ANY ')) continue;
      const path = node.name.slice(4);
      if (!path.startsWith('/') && path !== '') continue;
      const prefix = prefixBefore(prefixes, node.startLine);
      if (!prefix) continue;
      const full = joinGoPath(prefix, path || '');
      if (full !== path) {
        node.name = `ANY ${full}`;
        node.qualifiedName = rewriteRoutePathInQualified(node.qualifiedName, full);
      }
    }
  }

  return { nodes, references };
}

/**
 * Collect Fiber/Gin/Echo Group and Fiber Route-callback variable → full prefix.
 * Supports nested groups: `api := app.Group("/api"); auth := api.Group("/auth")`.
 */
export function collectGroupVarPrefixes(content: string): Map<string, string> {
  const safe = stripCommentsForRegex(content, 'go');
  const edges: Array<{ child: string; parent: string; path: string }> = [];

  const groupRe = /\b(\w+)\s*:?=\s*([\w.]+)\.Group\(\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = groupRe.exec(safe)) !== null) {
    edges.push({
      child: m[1]!,
      parent: receiverLeafName(m[2]!),
      path: m[3]!,
    });
  }

  // Fiber: app.Route("/api/v1", func(r fiber.Router) { … })
  const routeCbRe =
    /\b([\w.]+)\.Route\(\s*"([^"]+)"\s*,\s*func\s*\(\s*(\w+)\b/g;
  while ((m = routeCbRe.exec(safe)) !== null) {
    edges.push({
      child: m[3]!,
      parent: receiverLeafName(m[1]!),
      path: m[2]!,
    });
  }

  const resolved = new Map<string, string>();
  // Iterate until nested prefixes stabilize (bounded).
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const edge of edges) {
      const parentPrefix = resolved.get(edge.parent) ?? '';
      const full = joinGoPath(parentPrefix || '/', edge.path || '/');
      if (resolved.get(edge.child) !== full) {
        resolved.set(edge.child, full);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return resolved;
}

/** Collect mux subrouter field → path prefix from Routes struct comments and PathPrefix assignments. */
export function collectMuxRoutePrefixes(content: string): Map<string, string> {
  const safe = stripCommentsForRegex(content, 'go');
  const out = new Map<string, string>();

  // api.BaseRoutes.Users = api.BaseRoutes.ApiRoot.PathPrefix("/users").Subrouter()
  const assignRe =
    /(?:BaseRoutes|Routes|r)\.(\w+)\s*=\s*(?:[\w.]+\.)*PathPrefix\(\s*"([^"]+)"\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = assignRe.exec(safe)) !== null) {
    out.set(m[1]!, normalizeMuxPrefix(m[2]!));
  }

  // Users *mux.Router // 'api/v4/users'
  const structRe = /(\w+)\s+\*mux\.Router\s*\/\/\s*'([^']+)'/g;
  while ((m = structRe.exec(safe)) !== null) {
    if (!out.has(m[1]!)) out.set(m[1]!, normalizeMuxPrefix(m[2]!));
  }

  return out;
}

/** Apply cross-file mux prefixes to route nodes (postExtract). */
export function applyMuxRoutePrefixes(
  routes: Node[],
  prefixByField: Map<string, string>
): Node[] {
  if (prefixByField.size === 0) return [];

  const updates: Node[] = [];
  const seen = new Set<string>();

  for (const route of routes) {
    if (route.language !== 'go' || route.kind !== 'route') continue;
    const marker = route.qualifiedName.indexOf(GO_MUX_RECEIVER_MARKER);
    if (marker < 0) continue;

    const field = route.qualifiedName.slice(marker + GO_MUX_RECEIVER_MARKER.length);
    const prefix = prefixByField.get(field);
    if (!prefix) continue;

    const originalPath = routePathFromQualified(route.qualifiedName);
    const full = joinGoPath(prefix, originalPath);
    const method = route.name.split(' ')[0] ?? 'ANY';
    const newName = `${method} ${full}`;

    if (newName === route.name || seen.has(route.id + newName)) continue;
    seen.add(route.id + newName);

    updates.push({
      ...route,
      name: newName,
      // qualifiedName keeps the in-file fragment for idempotent re-runs.
    });
  }

  return updates;
}

function addGoRoute(
  nodes: Node[],
  references: UnresolvedRef[],
  filePath: string,
  line: number,
  method: string,
  path: string,
  length: number,
  handlerExpr: string,
  muxField: string | null,
  now: number
): void {
  const displayPath = path === '' ? '/' : path.startsWith('/') ? path : `/${path}`;
  const qn =
    `${filePath}::route:${displayPath}` +
    (muxField ? `${GO_MUX_RECEIVER_MARKER}${muxField}` : '');

  const routeNode: Node = {
    id: `route:${filePath}:${line}:${method}:${displayPath}`,
    kind: 'route',
    name: `${method} ${displayPath}`,
    qualifiedName: qn,
    filePath,
    startLine: line,
    endLine: line,
    startColumn: 0,
    endColumn: length,
    language: 'go',
    updatedAt: now,
  };
  nodes.push(routeNode);

  const handlerName = extractGoHandlerName(handlerExpr);
  if (handlerName) {
    references.push({
      fromNodeId: routeNode.id,
      referenceName: handlerName,
      referenceKind: 'references',
      line,
      column: 0,
      filePath,
      language: 'go',
    });
  }
}

/** Leaf identifier of a receiver expression (`api.BaseRoutes.Users` → `Users`). */
function receiverLeafName(receiver: string): string {
  const parts = receiver.split('.');
  return parts[parts.length - 1] ?? receiver;
}

/** Normalize Fiber/Gin `:id` / `:id?` / `:id<int>` params to `{id}`. */
function normalizeGoRoutePath(path: string): string {
  return path.replace(/:([A-Za-z_][A-Za-z0-9_]*)(?:<[^>]+>)?\??/g, '{$1}');
}

function isStaticFileHandler(expr: string): boolean {
  return /\bstatic\.New\b/.test(expr);
}

/** Scan comma-separated call args starting after the opening path argument's comma. */
function scanCallArgs(source: string, start: number): { args: string[]; end: number } {
  const args: string[] = [];
  let i = start;
  while (i < source.length) {
    while (i < source.length && /\s/.test(source[i]!)) i++;
    if (i >= source.length || source[i] === ')') break;
    const expr = scanBalancedExpr(source, i);
    if (!expr) break;
    let j = i;
    while (j < source.length && /\s/.test(source[j]!)) j++;
    i = j + expr.length;
    args.push(expr);
    while (i < source.length && /\s/.test(source[i]!)) i++;
    if (source[i] === ',') {
      i++;
      continue;
    }
    break;
  }
  return { args, end: i };
}

function extractMuxReceiverField(receiver: string): string | null {
  // api.BaseRoutes.Users → Users
  const m = receiver.match(/(?:BaseRoutes|Routes)\.(\w+)$/);
  return m ? m[1]! : null;
}

function routePathFromQualified(qn: string): string {
  const start = qn.indexOf('::route:');
  if (start < 0) return '/';
  const rest = qn.slice(start + '::route:'.length);
  const end = rest.indexOf(GO_MUX_RECEIVER_MARKER);
  const raw = end >= 0 ? rest.slice(0, end) : rest;
  return raw;
}

function rewriteRoutePathInQualified(qn: string, _newPath: string): string {
  // Same-file prefix pass: keep qualifiedName stable (postExtract owns cross-file).
  return qn;
}

function parseMethodList(raw: string | undefined): string[] {
  if (!raw) return [];
  return Array.from(raw.matchAll(/"([A-Z]+)"/g)).map((m) => m[1]!);
}

/** Scan a balanced parenthesis/brace/bracket expression starting at `start`. */
function scanBalancedExpr(source: string, start: number): string | null {
  let i = start;
  while (i < source.length && /\s/.test(source[i]!)) i++;
  if (i >= source.length) return null;

  const open = source[i]!;
  if (open === '(' || open === '{' || open === '[') {
    return scanBalancedFromOpen(source, i);
  }

  const ident = source.slice(i).match(/^[\w.]+/)?.[0];
  if (!ident) return null;
  i += ident.length;
  while (i < source.length && /\s/.test(source[i]!)) i++;
  if (source[i] === '(') {
    const call = scanBalancedFromOpen(source, i);
    if (!call) return ident;
    return ident + call;
  }
  return ident;
}

function scanBalancedFromOpen(source: string, openIndex: number): string | null {
  const open = source[openIndex]!;
  const close = open === '(' ? ')' : open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }
  return null;
}

function extractGoHandlerName(expr: string): string | null {
  let cleaned = expr.trim().replace(/\s+/g, ' ');

  // Unwrap middleware / API wrappers: api.APIHandler(fn), api.APISessionRequired(fn), …
  for (let i = 0; i < 6; i++) {
    const wrap = cleaned.match(
      /^(?:[\w.]+\.)?(?:APIHandler(?:TrustRequester)?|APISessionRequired(?:Mfa|DisableWhenBusy)?|RateLimitedHandler|RequireMfa|TrustRequester)\s*\(\s*(.+)\s*\)$/i
    );
    if (!wrap) break;
    cleaned = wrap[1]!.trim();
    // RateLimitedHandler(api.APIHandler(login), settings) — peel outer, then inner.
    if (cleaned.includes(',')) {
      const first = cleaned.split(',')[0]!.trim();
      const inner = extractGoHandlerName(first);
      if (inner) return inner;
    }
  }

  const tail = extractGoTailIdent(cleaned.replace(/\(\)$/, ''));
  return tail;
}

function extractGoTailIdent(expr: string): string | null {
  const cleaned = expr.trim().replace(/\s+/g, '').replace(/\(\)$/, '');
  const m = cleaned.match(/(?:\.|^)([A-Za-z_][A-Za-z0-9_]*)$/);
  return m ? m[1]! : null;
}

interface GoPrefix {
  path: string;
  line: number;
}

function collectGoPathPrefixes(safe: string): GoPrefix[] {
  const out: GoPrefix[] = [];
  // Only mux PathPrefix — Fiber/Gin Group + Fiber Route use collectGroupVarPrefixes.
  const re = /\.PathPrefix\(\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    out.push({
      path: m[1]!,
      line: safe.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

function prefixBefore(prefixes: GoPrefix[], line: number): string | null {
  let best: string | null = null;
  for (const p of prefixes) {
    if (p.line <= line) best = p.path;
  }
  return best;
}

function joinGoPath(prefix: string, sub: string): string {
  const parts = [prefix, sub]
    .map((p) => p.trim().replace(/^\/+|\/+$/g, ''))
    .filter((p) => p.length > 0);
  return '/' + parts.join('/');
}

function normalizeMuxPrefix(p: string): string {
  const trimmed = p.trim().replace(/^['"]|['"]$/g, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function matchGo122MethodPattern(routePath: string, rawMethod: string): string | null {
  if (rawMethod !== 'Handle' && rawMethod !== 'HandleFunc') return null;
  const m = routePath.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|CONNECT|TRACE)\s+\S/);
  return m ? m[1]! : null;
}
