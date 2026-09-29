/**
 * Go HTTP route extraction — Gin, Echo, Chi, Fiber, net/http, gorilla/mux.
 *
 * Kerno plugin: gorilla/mux subrouter `.Handle("", h).Methods(http.MethodPost)`,
 * cross-file PathPrefix / Routes-struct prefix merging (issue #7), and Fiber/Gin
 * Group / Route callback prefixes with nested routers (issue #27).
 *
 * Nested group callbacks (`m.Group("/repos", func() { m.Post(...) })`, chi/Fiber
 * `Route(pattern, func(r Router) { ... })`) keep an accumulated prefix, including
 * when the callback reuses the outer router variable. Same-file helpers that
 * receive that router inherit the prefix at each call site. A cross-file
 * `Mount("/api/v1", pkg.Routes())` is applied in postExtract.
 */

import { Node } from '../../types';
import { UnresolvedRef } from '../../resolution/types';
import { stripCommentsForRegex } from '../../resolution/strip-comments';

/** Marker in route qualifiedName holding the mux subrouter field for postExtract. */
export const GO_MUX_RECEIVER_MARKER = '::@mux:';

/** Marker in route qualifiedName holding the function a Mount() call targets. */
export const GO_MOUNT_MARKER = '::@gomount:';

/**
 * Marker for a route registered on a function parameter whose caller lives in
 * another file. Value is `FuncName:paramIndex`. postExtract prepends the
 * group prefix passed at the call site.
 */
export const GO_GROUP_FN_MARKER = '::@gogroupfn:';

export interface GoRouteExtractResult {
  nodes: Node[];
  references: UnresolvedRef[];
}

interface PendingGoRoute {
  index: number;
  receiver: string;
  method: string;
  routePath: string;
  length: number;
  handlerExpr: string;
  muxField: string | null;
  isHandle: boolean;
}

/** Extract route nodes from a Go source file. `consts` supplies string constants declared in other files. */
export function extractGoHttpRoutes(
  filePath: string,
  content: string,
  consts?: Map<string, string>
): GoRouteExtractResult {
  if (!filePath.endsWith('.go')) return { nodes: [], references: [] };
  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();
  const safe = stripCommentsForRegex(content, 'go');
  const prefixes = buildGoPrefixIndex(safe, consts);
  const pending: PendingGoRoute[] = [];

  const routeHeadRe =
    /(\b[\w.]+)\.(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|CONNECT|TRACE|Get|Post|Put|Patch|Delete|Options|Head|Connect|Trace|All|Any|Handle|HandleFunc)\s*\(\s*"([^"]*)"\s*,\s*/g;

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
    const isAll = rawMethod === 'All' || rawMethod === 'Any';
    const groupPrefix = prefixAt(prefixes, receiver, head.index);
    const onParam = receiverIsFuncParam(prefixes, receiver, head.index);

    if (!routePath.startsWith('/') && routePath !== '' && !methodPrefix && !groupPrefix && !onParam) continue;
    if (routePath === '' && !isHandle && !groupPrefix && !onParam) continue;

    let path = methodPrefix ? routePath.slice(methodPrefix.length).trimStart() : routePath;
    const method = methodPrefix
      ? methodPrefix
      : chainedMethod
        ? chainedMethod
        : isHandle || isAll
          ? 'ANY'
          : rawMethod.toUpperCase();

    pending.push({
      index: head.index,
      receiver,
      method,
      routePath: path,
      length: end - head.index,
      handlerExpr,
      muxField: extractMuxReceiverField(receiver),
      isHandle,
    });
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

    const groupPrefix = prefixAt(prefixes, receiver, addMatch.index);
    const onParam = receiverIsFuncParam(prefixes, receiver, addMatch.index);
    if (!routePath.startsWith('/') && !groupPrefix && !onParam) continue;

    for (const method of methods) {
      pending.push({
        index: addMatch.index,
        receiver,
        method,
        routePath,
        length: end - addMatch.index,
        handlerExpr,
        muxField: null,
        isHandle: false,
      });
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
    const groupPrefix = prefixAt(prefixes, receiver, match.index);
    const onParam = receiverIsFuncParam(prefixes, receiver, match.index);
    if (!routePath.startsWith('/') && !groupPrefix && !onParam) continue;
    const methods = methodsRaw.includes('"')
      ? Array.from(methodsRaw.matchAll(/"([A-Z]+)"/g)).map((m) => m[1]!)
      : methodsRaw
        ? [methodsRaw]
        : ['ANY'];
    for (const method of methods.length > 0 ? methods : ['ANY']) {
      pending.push({
        index: match.index,
        receiver,
        method,
        routePath,
        length: match[0].length,
        handlerExpr,
        muxField: null,
        isHandle: false,
      });
    }
  }

  // Gitea: m.Methods("HEAD,GET", "/path", handler, ...)
  const methodsCommaRe =
    /\b([\w.]+)\.Methods\s*\(\s*"([A-Z]+(?:,[A-Z]+)+)"\s*,\s*"([^"]*)"\s*,\s*/g;
  let commaMatch: RegExpExecArray | null;
  while ((commaMatch = methodsCommaRe.exec(safe)) !== null) {
    const receiver = commaMatch[1]!;
    const methods = commaMatch[2]!.split(',').map((part) => part.trim()).filter(Boolean);
    const routePath = commaMatch[3]!;
    const handlerStart = commaMatch.index + commaMatch[0].length;
    const { args, end: argsEnd } = scanCallArgs(safe, handlerStart);
    if (args.length === 0 || methods.length === 0) continue;
    const handlerExpr = args[args.length - 1]!;
    if (isStaticFileHandler(handlerExpr)) continue;
    let end = argsEnd;
    const closeParen = safe.slice(end).match(/^\s*\)/);
    if (closeParen) end += closeParen[0].length;
    const groupPrefix = prefixAt(prefixes, receiver, commaMatch.index);
    const onParam = receiverIsFuncParam(prefixes, receiver, commaMatch.index);
    if (!routePath.startsWith('/') && routePath !== '' && !groupPrefix && !onParam) continue;
    for (const method of methods) {
      pending.push({
        index: commaMatch.index,
        receiver,
        method,
        routePath,
        length: end - commaMatch.index,
        handlerExpr,
        muxField: null,
        isHandle: false,
      });
    }
  }

  // Gitea Combo: m.Combo("/path", mw...).Get(h).Delete(h)
  const comboRe = /\b([\w.]+)\.Combo\s*\(\s*"([^"]*)"/g;
  let comboMatch: RegExpExecArray | null;
  while ((comboMatch = comboRe.exec(safe)) !== null) {
    const receiver = comboMatch[1]!;
    const routePath = comboMatch[2]!;
    const open = safe.indexOf('(', comboMatch.index);
    const comboCall = open >= 0 ? scanBalancedCode(safe, open) : null;
    if (!comboCall) continue;
    let i = open + comboCall.length;
    while (i < safe.length) {
      const chain = safe.slice(i).match(
        /^\s*\.\s*(Get|Post|Put|Patch|Delete|Head|Options|GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/
      );
      if (!chain) break;
      const method = chain[1]!.toUpperCase();
      const argStart = i + chain[0].length;
      const { args, end: argsEnd } = scanCallArgs(safe, argStart);
      let end = argsEnd;
      const closeParen = safe.slice(end).match(/^\s*\)/);
      if (closeParen) end += closeParen[0].length;
      const handlerExpr = args.length > 0 ? args[args.length - 1]! : '';
      if (handlerExpr && !isStaticFileHandler(handlerExpr)) {
        pending.push({
          index: comboMatch.index,
          receiver,
          method,
          routePath,
          length: end - comboMatch.index,
          handlerExpr,
          muxField: null,
          isHandle: false,
        });
      }
      i = end;
    }
  }

  flushPendingGoRoutes(pending, prefixes, nodes, references, filePath, safe, now);

  // Same-file mux PathPrefix stacking for fragment-only ANY routes.
  // Group/Route prefixes are applied by buildGoPrefixIndex — not here.
  const pathPrefixes = collectGoPathPrefixes(safe);
  if (pathPrefixes.length > 0) {
    for (const node of nodes) {
      if (!node.name.startsWith('ANY ')) continue;
      const path = node.name.slice(4);
      if (!path.startsWith('/') && path !== '') continue;
      const prefix = prefixBefore(pathPrefixes, node.startLine);
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
  const consts = mergeGoConsts(safe, undefined);
  const imports = parseGoImports(safe);
  const edges: Array<{ child: string; parent: string; path: string }> = [];

  const groupRe = /\b(\w+)\s*:?=\s*([\w.]+)\.Group\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = groupRe.exec(safe)) !== null) {
    const open = safe.indexOf('(', m.index + m[1]!.length);
    const arg = open >= 0 ? readFirstArg(safe, open) : null;
    const path = arg == null ? null : resolveGoPrefixExpr(arg, consts, imports);
    if (path === null) continue;
    edges.push({
      child: m[1]!,
      parent: receiverLeafName(m[2]!),
      path,
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

/**
 * Collect mux subrouter field → path prefix.
 * A struct-comment path (`Users *mux.Router // 'api/v4/users'`) is authoritative
 * and wins over a partial `PathPrefix` assignment. Assignments without a comment
 * compose onto the parent subrouter, and a non-literal argument keeps its
 * string-literal and const parts (`model.APIURLSuffix`, `base + "/api/v4"`).
 */
export function collectMuxRoutePrefixes(
  content: string,
  consts?: Map<string, string>
): Map<string, string> {
  const safe = stripCommentsForRegex(content, 'go');
  const allConsts = mergeGoConsts(safe, consts);
  const imports = parseGoImports(safe);
  const comments = collectMuxCommentPrefixes(content);

  interface MuxEdge {
    child: string;
    parent: string | null;
    path: string;
  }
  const edges: MuxEdge[] = [];
  const assignRe = /(?:BaseRoutes|Routes|r)\.(\w+)\s*=\s*([\w.]*)\.PathPrefix\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = assignRe.exec(safe)) !== null) {
    const open = safe.indexOf('(', m.index);
    const arg = open >= 0 ? readFirstArg(safe, open) : null;
    const path = arg == null ? null : resolveGoPrefixExpr(arg, allConsts, imports);
    if (path === null) continue;
    edges.push({
      child: m[1]!,
      parent: muxParentField(m[2]!),
      path,
    });
  }

  const out = new Map(comments);
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (const edge of edges) {
      if (comments.has(edge.child)) continue;
      const parentPrefix = edge.parent ? (out.get(edge.parent) ?? '') : '';
      const full = joinGoPath(parentPrefix || '/', edge.path);
      if (out.get(edge.child) !== full) {
        out.set(edge.child, full);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

/** Struct-comment paths, read from the raw source so comment-stripping cannot drop them. */
function collectMuxCommentPrefixes(content: string): Map<string, string> {
  const out = new Map<string, string>();
  const structRe = /(\w+)\s+\*mux\.Router\s*\/\/\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = structRe.exec(content)) !== null) {
    out.set(m[1]!, normalizeMuxPrefix(m[2]!));
  }
  return out;
}

function muxParentField(receiver: string): string | null {
  const leaf = receiver.split('.').filter(Boolean).pop() ?? '';
  if (!leaf || leaf === 'Router' || leaf === 'r') return null;
  return leaf;
}

/** Keep the longer path when one is a suffix of the other (partial assignment vs full comment). */
export function preferMuxPrefix(current: string | undefined, next: string): string {
  if (!current) return next;
  const c = current.replace(/^\/+/, '');
  const n = next.replace(/^\/+/, '');
  if (c.endsWith('/' + n) || c.endsWith(n) && c.length > n.length) return current;
  if (n.length > c.length && (n.endsWith('/' + c) || n.endsWith(c))) return next;
  return next;
}

export function collectGoStringConsts(content: string): Map<string, string> {
  const src = stripCommentsForRegex(content, 'go');
  const out = new Map<string, string>();
  const pkg = /^\s*package\s+(\w+)/m.exec(src)?.[1];
  const add = (name: string, value: string) => {
    out.set(name, value);
    if (pkg) out.set(`${pkg}.${name}`, value);
  };
  const spec = /(\w+)\s*(?:string\s*)?=\s*"([^"]*)"/g;
  const single = /\bconst\s+(\w+)\s*(?:string\s*)?=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = single.exec(src)) !== null) add(m[1]!, m[2]!);
  const block = /\bconst\s*\(([^)]*)\)/g;
  while ((m = block.exec(src)) !== null) {
    const body = m[1]!;
    let s: RegExpExecArray | null;
    spec.lastIndex = 0;
    while ((s = spec.exec(body)) !== null) add(s[1]!, s[2]!);
  }
  return out;
}

function mergeGoConsts(src: string, extra: Map<string, string> | undefined): Map<string, string> {
  const out = new Map(extra ?? []);
  for (const [key, value] of collectGoStringConsts(src)) out.set(key, value);
  return out;
}

/**
 * Literal portion of a prefix expression. Unknown identifiers are skipped, so
 * `base + "/api/v1"` contributes `/api/v1` and `constants.APIPrefix + "/slave"`
 * contributes the const value plus `/slave`. Returns null when the expression
 * has no literal or const part (a bare `base`).
 */
export function resolveGoPrefixExpr(
  expr: string,
  consts: Map<string, string>,
  imports: Map<string, string>
): string | null {
  let s = expr.trim();
  if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1).trim();
  const parts = splitTopLevel(s, '+');
  let value = '';
  let any = false;
  for (const part of parts) {
    const token = part.trim();
    if (!token) continue;
    const lit = token.match(/^"([^"]*)"$/);
    if (lit) {
      value += lit[1]!;
      any = true;
      continue;
    }
    const raw = token.match(/^`([^`]*)`$/);
    if (raw) {
      value += raw[1]!;
      any = true;
      continue;
    }
    const resolved = lookupGoConst(token, consts, imports);
    if (resolved != null) {
      value += resolved;
      any = true;
    }
  }
  return any ? value : null;
}

function lookupGoConst(
  token: string,
  consts: Map<string, string>,
  imports: Map<string, string>
): string | null {
  if (consts.has(token)) return consts.get(token)!;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const alias = token.slice(0, dot);
  const name = token.slice(dot + 1);
  const importPath = imports.get(alias);
  if (!importPath) return null;
  const pkg = importPath.split('/').pop();
  if (!pkg) return null;
  return consts.get(`${pkg}.${name}`) ?? null;
}

function splitTopLevel(expr: string, op: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]!;
    if (c === '"') {
      i = skipGoString(expr, i);
      continue;
    }
    if (c === '`') {
      i = skipGoRaw(expr, i);
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (c === op && depth === 0) {
      parts.push(expr.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(expr.slice(start));
  return parts;
}

/** First argument of a call, or null when the call starts with a func literal. */
function readFirstArg(src: string, openParen: number): string | null {
  let i = skipWs(src, openParen + 1);
  if (i >= src.length) return null;
  if (src.startsWith('func', i) && identBoundary(src, i)) return null;
  const start = i;
  let depth = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '"') {
      i = skipGoString(src, i) + 1;
      continue;
    }
    if (c === '`') {
      i = skipGoRaw(src, i) + 1;
      continue;
    }
    if (c === '\'') {
      i = skipGoString(src, i) + 1;
      continue;
    }
    if (c === '(' || c === '{' || c === '[') {
      depth++;
      i++;
      continue;
    }
    if (c === ')' || c === '}' || c === ']') {
      if (depth === 0) return src.slice(start, i).trim();
      depth--;
      i++;
      continue;
    }
    if (c === ',' && depth === 0) return src.slice(start, i).trim();
    i++;
  }
  return null;
}

function findFuncCalls(src: string, name: string): Array<{ index: number; args: string[] }> {
  const out: Array<{ index: number; args: string[] }> = [];
  const re = new RegExp(`(?:^|[^\\w])${name}\\s*\\(`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const open = src.indexOf('(', m.index);
    if (open < 0) continue;
    const nameIndex = open - name.length;
    const before = src.slice(Math.max(0, nameIndex - 80), nameIndex);
    if (/\bfunc\b[^;{}]*$/.test(before)) continue;
    const call = scanBalancedCode(src, open);
    if (!call) continue;
    out.push({ index: open, args: splitTopLevel(call.slice(1, -1), ',') });
  }
  return out;
}

/** `FuncName:paramIndex` → call-site group prefix, when every call agrees. */
export function collectGoGroupFnPrefixes(
  files: Array<{ filePath: string; content: string }>,
  wanted: Map<string, { name: string; paramIndex: number }>,
  consts: Map<string, string>
): Map<string, string> {
  const found = new Map<string, Set<string>>();
  for (const file of files) {
    const safe = stripCommentsForRegex(file.content, 'go');
    const index = buildGoPrefixIndex(safe, consts);
    for (const [key, spec] of wanted) {
      for (const call of findFuncCalls(safe, spec.name)) {
        const arg = call.args[spec.paramIndex];
        if (arg == null) continue;
        const leaf = receiverLeafName(arg.trim());
        if (!leaf || !/^[\w.]+$/.test(arg.trim())) continue;
        const prefix = index.prefixFor(leaf, call.index);
        if (!prefix) continue;
        let set = found.get(key);
        if (!set) {
          set = new Set();
          found.set(key, set);
        }
        set.add(prefix);
      }
    }
  }
  const out = new Map<string, string>();
  for (const [key, set] of found) {
    if (set.size === 1) out.set(key, [...set][0]!);
  }
  return out;
}

export function readGoGroupFn(qualifiedName: string): { key: string; name: string; paramIndex: number } | null {
  const raw = markerValue(qualifiedName, GO_GROUP_FN_MARKER);
  if (!raw) return null;
  const colon = raw.lastIndexOf(':');
  if (colon <= 0) return null;
  const paramIndex = Number(raw.slice(colon + 1));
  if (!Number.isInteger(paramIndex) || paramIndex < 0) return null;
  return { key: raw, name: raw.slice(0, colon), paramIndex };
}

/** Replace qualifiedNames with a const-aware re-extract. Same node id is kept. */
export function overlayGoRoutePaths(
  routes: Node[],
  files: Array<{ filePath: string; content: string }>,
  consts: Map<string, string>
): void {
  const fresh = new Map<string, Node[]>();
  for (const file of files) {
    const extracted = extractGoHttpRoutes(file.filePath, file.content, consts);
    for (const node of extracted.nodes) {
      const method = node.name.split(' ')[0] ?? '';
      const key = `${node.filePath}|${node.startLine}|${method}`;
      const list = fresh.get(key) ?? [];
      list.push(node);
      fresh.set(key, list);
    }
  }
  for (const route of routes) {
    if (route.language !== 'go' || !route.qualifiedName.includes('::route:')) continue;
    const method = route.name.split(' ')[0] ?? '';
    const list = fresh.get(`${route.filePath}|${route.startLine}|${method}`);
    if (!list || list.length !== 1) continue;
    const next = list[0]!;
    if (next.qualifiedName !== route.qualifiedName) route.qualifiedName = next.qualifiedName;
  }
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

    const field = markerValue(route.qualifiedName, GO_MUX_RECEIVER_MARKER);
    const prefix = field ? prefixByField.get(field) : undefined;
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

interface GoFuncSpan {
  name: string;
  bodyStart: number;
  bodyEnd: number;
  params: string[];
}

interface GoPrefixIndex {
  prefixFor(name: string, pos: number): string;
  funcs: GoFuncSpan[];
}

interface ResolvedScope {
  bodyStart: number;
  bodyEnd: number;
  bindName: string;
  full: string;
}

interface ResolvedAssign {
  index: number;
  funcEnd: number;
  child: string;
  full: string;
}

/**
 * Positional Group/Route prefixes. Assignment form (`api := app.Group("/api")`)
 * and callback form (`m.Group("/repos", func() { ... })`, `r.Route("/api", func(r Router)`)
 * both contribute. A callback parameter shadows the outer name only inside its body.
 */
function buildGoPrefixIndex(src: string, extraConsts?: Map<string, string>): GoPrefixIndex {
  const funcs = collectFuncSpans(src);
  const consts = mergeGoConsts(src, extraConsts);
  const imports = parseGoImports(src);
  const scopes: ResolvedScope[] = [];
  const assigns: ResolvedAssign[] = [];

  const prefixFor = (name: string, pos: number): string => {
    let best: ResolvedScope | null = null;
    for (const scope of scopes) {
      if (scope.bindName !== name) continue;
      if (pos > scope.bodyStart && pos < scope.bodyEnd) {
        if (!best || scope.bodyStart >= best.bodyStart) best = scope;
      }
    }
    if (best) return best.full;
    let bestAssign: ResolvedAssign | null = null;
    for (const assign of assigns) {
      if (assign.child !== name) continue;
      if (assign.index < pos && pos < assign.funcEnd) {
        if (!bestAssign || assign.index > bestAssign.index) bestAssign = assign;
      }
    }
    return bestAssign?.full ?? '';
  };

  type Event =
    | { kind: 'assign'; index: number; child: string; parent: string; path: string; funcEnd: number }
    | {
        kind: 'scope';
        index: number;
        bodyStart: number;
        bodyEnd: number;
        pattern: string;
        bindName: string;
        parent: string;
      };

  const events: Event[] = [];
  const assignRe = /\b(\w+)\s*:?=\s*([\w.]+)\.(?:Group|Route)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = assignRe.exec(src)) !== null) {
    const open = src.indexOf('(', m.index + m[1]!.length);
    const arg = open >= 0 ? readFirstArg(src, open) : null;
    const path = arg == null ? null : resolveGoPrefixExpr(arg, consts, imports);
    if (path === null) continue;
    const fn = enclosingFunc(funcs, m.index);
    events.push({
      kind: 'assign',
      index: m.index,
      child: m[1]!,
      parent: receiverLeafName(m[2]!),
      path,
      funcEnd: fn ? fn.bodyEnd : Number.POSITIVE_INFINITY,
    });
  }

  const scopeRe = /\b([\w.]+)\.(Group|Route)\s*\(/g;
  while ((m = scopeRe.exec(src)) !== null) {
    const open = src.indexOf('(', m.index + m[1]!.length);
    if (open < 0) continue;
    const parsed = parseGroupCallback(src, open, consts, imports);
    if (!parsed) continue;
    const parent = receiverLeafName(m[1]!);
    events.push({
      kind: 'scope',
      index: m.index,
      bodyStart: parsed.bodyStart,
      bodyEnd: parsed.bodyEnd,
      pattern: parsed.pattern,
      bindName: parsed.paramName ?? parent,
      parent,
    });
  }

  events.sort((a, b) => a.index - b.index);
  for (const event of events) {
    if (event.kind === 'assign') {
      const parentPrefix = prefixFor(event.parent, event.index);
      assigns.push({
        index: event.index,
        funcEnd: event.funcEnd,
        child: event.child,
        full: joinGoPath(parentPrefix || '/', event.path || '/'),
      });
    } else {
      const parentPrefix = prefixFor(event.parent, event.index);
      const full = event.pattern
        ? joinGoPath(parentPrefix || '/', event.pattern)
        : parentPrefix;
      scopes.push({
        bodyStart: event.bodyStart,
        bodyEnd: event.bodyEnd,
        bindName: event.bindName,
        full,
      });
    }
  }

  return { prefixFor, funcs };
}

function prefixAt(index: GoPrefixIndex, receiver: string, pos: number): string {
  return index.prefixFor(receiverLeafName(receiver), pos);
}

function receiverIsFuncParam(index: GoPrefixIndex, receiver: string, pos: number): boolean {
  const fn = enclosingFunc(index.funcs, pos);
  if (!fn) return false;
  return fn.params.includes(receiverLeafName(receiver));
}

function enclosingFunc(funcs: GoFuncSpan[], pos: number): GoFuncSpan | null {
  let best: GoFuncSpan | null = null;
  for (const fn of funcs) {
    if (pos > fn.bodyStart && pos < fn.bodyEnd) {
      if (!best || fn.bodyStart >= best.bodyStart) best = fn;
    }
  }
  return best;
}

interface RouteTemplate {
  funcName: string;
  paramIndex: number;
  method: string;
  path: string;
  index: number;
  length: number;
  handlerExpr: string;
  muxField: string | null;
}

interface HelperCall {
  name: string;
  arg: string;
  index: number;
}

interface ClosureSpan {
  name: string;
  assignIndex: number;
  bodyStart: number;
  bodyEnd: number;
  params: string[];
}

interface ClosureTemplate {
  closureName: string;
  receiver: string;
  method: string;
  path: string;
  index: number;
  length: number;
  handlerExpr: string;
  muxField: string | null;
}

function flushPendingGoRoutes(
  pending: PendingGoRoute[],
  prefixes: GoPrefixIndex,
  nodes: Node[],
  references: UnresolvedRef[],
  filePath: string,
  safe: string,
  now: number
): void {
  const templates: RouteTemplate[] = [];
  const closureTemplates: ClosureTemplate[] = [];
  const closures = collectClosureSpans(safe);
  const emitted = new Set<string>();

  const emit = (
    method: string,
    path: string,
    index: number,
    length: number,
    handlerExpr: string,
    muxField: string | null,
    mountFunc: string | null,
    groupFn: string | null = null
  ) => {
    const normalized = normalizeGoRoutePath(path);
    const key = `${mountFunc ?? ''}\0${method}\0${normalized}\0${index}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    const line = safe.slice(0, index).split('\n').length;
    addGoRoute(
      nodes,
      references,
      filePath,
      line,
      method,
      normalized,
      length,
      handlerExpr,
      muxField,
      mountFunc,
      groupFn,
      now
    );
  };

  for (const route of pending) {
    const leaf = receiverLeafName(route.receiver);
    const local = composeGoPrefix(prefixes.prefixFor(leaf, route.index), route.routePath);
    const closure = enclosingClosure(closures, route.index);
    if (closure && !closure.params.includes(leaf)) {
      const definedAt = prefixes.prefixFor(leaf, closure.assignIndex);
      closureTemplates.push({
        closureName: closure.name,
        receiver: leaf,
        method: route.method,
        path: relativeToPrefix(definedAt, local),
        index: route.index,
        length: route.length,
        handlerExpr: route.handlerExpr,
        muxField: route.muxField,
      });
      continue;
    }
    const fn = enclosingFunc(prefixes.funcs, route.index);
    if (fn && fn.params.includes(leaf)) {
      templates.push({
        funcName: fn.name,
        paramIndex: fn.params.indexOf(leaf),
        method: route.method,
        path: local,
        index: route.index,
        length: route.length,
        handlerExpr: route.handlerExpr,
        muxField: route.muxField,
      });
      continue;
    }
    const mountFunc = fn?.name ?? null;
    emit(route.method, local, route.index, route.length, route.handlerExpr, route.muxField, mountFunc);
  }

  const closureNames = new Set(closureTemplates.map((t) => t.closureName));
  const calledClosures = new Set<string>();
  if (closureNames.size > 0) {
    for (const call of collectZeroArgCalls(safe)) {
      if (!closureNames.has(call.name)) continue;
      calledClosures.add(call.name);
      const caller = enclosingFunc(prefixes.funcs, call.index);
      for (const template of closureTemplates) {
        if (template.closureName !== call.name) continue;
        const callPrefix = prefixes.prefixFor(template.receiver, call.index);
        const full = composeGoPrefix(callPrefix, template.path);
        if (caller && caller.params.includes(template.receiver)) {
          templates.push({
            funcName: caller.name,
            paramIndex: caller.params.indexOf(template.receiver),
            method: template.method,
            path: full,
            index: template.index,
            length: template.length,
            handlerExpr: template.handlerExpr,
            muxField: template.muxField,
          });
          continue;
        }
        emit(
          template.method,
          full,
          template.index,
          template.length,
          template.handlerExpr,
          template.muxField,
          caller?.name ?? null
        );
      }
    }
    for (const template of closureTemplates) {
      if (calledClosures.has(template.closureName)) continue;
      const closure = closures.find((c) => c.name === template.closureName);
      const definedAt = closure ? prefixes.prefixFor(template.receiver, closure.assignIndex) : '';
      const caller = enclosingFunc(prefixes.funcs, template.index);
      emit(
        template.method,
        composeGoPrefix(definedAt, template.path),
        template.index,
        template.length,
        template.handlerExpr,
        template.muxField,
        caller?.name ?? null
      );
    }
  }

  if (templates.length === 0) return;

  const helperNames = new Set(templates.map((t) => t.funcName));
  const calls = collectHelperCalls(safe);
  const expanded = new Set<string>();

  interface Job {
    funcName: string;
    prefix: string;
    mountFunc: string | null;
  }
  const jobs: Job[] = [];
  for (const call of calls) {
    if (!helperNames.has(call.name)) continue;
    const caller = enclosingFunc(prefixes.funcs, call.index);
    if (caller && helperNames.has(caller.name)) continue;
    jobs.push({
      funcName: call.name,
      prefix: prefixes.prefixFor(call.arg, call.index),
      mountFunc: caller?.name ?? null,
    });
  }

  const seenJob = new Set<string>();
  while (jobs.length > 0) {
    const job = jobs.shift()!;
    const jobKey = `${job.funcName}\0${job.prefix}\0${job.mountFunc ?? ''}`;
    if (seenJob.has(jobKey)) continue;
    seenJob.add(jobKey);
    expanded.add(job.funcName);
    for (const template of templates) {
      if (template.funcName !== job.funcName) continue;
      const full = composeGoPrefix(job.prefix, template.path);
      emit(
        template.method,
        full,
        template.index,
        template.length,
        template.handlerExpr,
        template.muxField,
        job.mountFunc
      );
    }
    const span = prefixes.funcs.find((fn) => fn.name === job.funcName);
    if (!span) continue;
    for (const call of calls) {
      if (!helperNames.has(call.name)) continue;
      if (call.index <= span.bodyStart || call.index >= span.bodyEnd) continue;
      const rel = prefixes.prefixFor(call.arg, call.index);
      jobs.push({
        funcName: call.name,
        prefix: composeGoPrefix(job.prefix, rel),
        mountFunc: job.mountFunc,
      });
    }
  }

  for (const template of templates) {
    if (expanded.has(template.funcName)) continue;
    emit(
      template.method,
      template.path,
      template.index,
      template.length,
      template.handlerExpr,
      template.muxField,
      template.funcName,
      `${template.funcName}:${template.paramIndex}`
    );
  }
}

function composeGoPrefix(prefix: string, path: string): string {
  if (!prefix) return path || '/';
  return joinGoPath(prefix, path || '/');
}

/** Path of `full` relative to `base`, both absolute route prefixes. */
function relativeToPrefix(base: string, full: string): string {
  if (!base || base === '/') return full || '/';
  if (full === base) return '/';
  if (full.startsWith(`${base}/`)) return full.slice(base.length);
  return full;
}

function enclosingClosure(closures: ClosureSpan[], pos: number): ClosureSpan | null {
  let best: ClosureSpan | null = null;
  for (const closure of closures) {
    if (pos > closure.bodyStart && pos < closure.bodyEnd) {
      if (!best || closure.bodyStart >= best.bodyStart) best = closure;
    }
  }
  return best;
}

function collectClosureSpans(src: string): ClosureSpan[] {
  const spans: ClosureSpan[] = [];
  const re = /\b(\w+)\s*:?=\s*func\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const funcAt = src.indexOf('func', m.index);
    if (funcAt < 0) continue;
    const parsed = parseFuncLiteral(src, funcAt);
    if (!parsed) continue;
    spans.push({
      name: m[1]!,
      assignIndex: m.index,
      bodyStart: parsed.bodyStart,
      bodyEnd: parsed.bodyEnd,
      params: parsed.paramNames,
    });
  }
  return spans;
}

function collectZeroArgCalls(src: string): Array<{ name: string; index: number }> {
  const out: Array<{ name: string; index: number }> = [];
  const re = /(^|[^\w.])([A-Za-z_]\w*)\s*\(\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const name = m[2]!;
    const index = m.index + m[1]!.length;
    const before = src.slice(Math.max(0, index - 6), index);
    if (/\bfunc\s*$/.test(before)) continue;
    if (name === 'func' || name === 'if' || name === 'for' || name === 'switch' || name === 'return') {
      continue;
    }
    out.push({ name, index });
  }
  return out;
}

function collectHelperCalls(src: string): HelperCall[] {
  const out: HelperCall[] = [];
  const re = /(^|[^\w.])([A-Za-z_]\w*)\s*\(\s*([A-Za-z_]\w*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const name = m[2]!;
    const index = m.index + m[1]!.length;
    const before = src.slice(Math.max(0, index - 6), index);
    if (/\bfunc\s*$/.test(before)) continue;
    if (name === 'func' || name === 'if' || name === 'for' || name === 'switch' || name === 'return') {
      continue;
    }
    out.push({ name, arg: m[3]!, index });
  }
  return out;
}

function collectFuncSpans(src: string): GoFuncSpan[] {
  const spans: GoFuncSpan[] = [];
  const re = /\bfunc\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > 0 && /[\w]/.test(src[m.index - 1]!)) continue;
    let i = skipWs(src, m.index + 4);
    let name = '';
    if (src[i] === '(') {
      const recv = scanBalancedCode(src, i);
      if (!recv) continue;
      i = skipWs(src, i + recv.length);
      const nm = src.slice(i).match(/^(\w+)/);
      if (!nm) continue;
      name = nm[1]!;
      i += nm[0].length;
    } else {
      const nm = src.slice(i).match(/^(\w+)/);
      if (!nm) continue;
      name = nm[1]!;
      i += nm[0].length;
    }
    i = skipWs(src, i);
    if (src[i] !== '(') continue;
    const paramsRaw = scanBalancedCode(src, i);
    if (!paramsRaw) continue;
    i = skipWs(src, i + paramsRaw.length);
    if (src[i] === '(') {
      const results = scanBalancedCode(src, i);
      if (!results) continue;
      i = skipWs(src, i + results.length);
    } else {
      const brace = findBodyBrace(src, i);
      if (brace < 0) continue;
      i = brace;
    }
    if (src[i] !== '{') {
      const brace = findBodyBrace(src, i);
      if (brace < 0) continue;
      i = brace;
    }
    const body = scanBalancedCode(src, i);
    if (!body) continue;
    spans.push({
      name,
      bodyStart: i,
      bodyEnd: i + body.length,
      params: parseParamNames(paramsRaw),
    });
    re.lastIndex = i + body.length;
  }
  return spans;
}

function findBodyBrace(src: string, start: number): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i]!;
    if (c === '"') {
      i = skipGoString(src, i);
      continue;
    }
    if (c === '`') {
      i = skipGoRaw(src, i);
      continue;
    }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    else if (c === '{' && depth === 0) return i;
    else if (c === '\n' && depth === 0) {
      const rest = src.slice(i + 1, i + 80);
      if (/^\s*(?:func\b|type\b|var\b|const\b)/.test(rest)) return -1;
    }
  }
  return -1;
}

function parseParamNames(paramsRaw: string): string[] {
  const inner = paramsRaw.slice(1, -1);
  const names: string[] = [];
  let i = 0;
  while (i < inner.length) {
    while (i < inner.length && /[\s,]/.test(inner[i]!)) i++;
    if (i >= inner.length) break;
    if (inner.startsWith('func', i) && (i === 0 || /[\s,]/.test(inner[i - 1]!))) {
      i += 4;
      i = skipWs(inner, i);
      if (inner[i] === '(') {
        const params = scanBalancedCode(inner, i);
        if (!params) break;
        i += params.length;
      }
      continue;
    }
    const id = inner.slice(i).match(/^(\w+)/);
    if (!id) {
      i++;
      continue;
    }
    const name = id[1]!;
    i += id[0].length;
    if (name !== '_') names.push(name);
    let depth = 0;
    while (i < inner.length) {
      const c = inner[i]!;
      if (c === '"' || c === '\'' || c === '`') {
        i = (c === '`' ? skipGoRaw(inner, i) : skipGoString(inner, i)) + 1;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
      else if (c === ',' && depth === 0) {
        i++;
        break;
      }
      i++;
    }
  }
  return names;
}

function parseGroupCallback(
  src: string,
  openParen: number,
  consts: Map<string, string>,
  imports: Map<string, string>
): { pattern: string; paramName: string | null; bodyStart: number; bodyEnd: number } | null {
  const arg = readFirstArg(src, openParen);
  const resolved = arg == null ? '' : (resolveGoPrefixExpr(arg, consts, imports) ?? '');
  let i = openParen + 1;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const c = src[i]!;
    if (c === '"') {
      i = skipGoString(src, i) + 1;
      continue;
    }
    if (c === '`') {
      i = skipGoRaw(src, i) + 1;
      continue;
    }
    if (c === '\'') {
      i = skipGoString(src, i) + 1;
      continue;
    }
    if (depth === 1 && src.startsWith('func', i) && identBoundary(src, i)) {
      const fn = parseFuncLiteral(src, i);
      if (fn) {
        return {
          pattern: resolved,
          paramName: fn.paramName,
          bodyStart: fn.bodyStart,
          bodyEnd: fn.bodyEnd,
        };
      }
    }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    i++;
  }
  return null;
}

function parseFuncLiteral(
  src: string,
  i: number
): { paramName: string | null; paramNames: string[]; bodyStart: number; bodyEnd: number } | null {
  let j = skipWs(src, i + 4);
  if (src[j] !== '(') return null;
  const params = scanBalancedCode(src, j);
  if (!params) return null;
  j = skipWs(src, j + params.length);
  if (src[j] !== '{') {
    const brace = findBodyBrace(src, j);
    if (brace < 0) return null;
    j = brace;
  }
  const body = scanBalancedCode(src, j);
  if (!body) return null;
  const names = parseParamNames(params);
  return {
    paramName: names[0] ?? null,
    paramNames: names,
    bodyStart: j,
    bodyEnd: j + body.length,
  };
}

function identBoundary(src: string, i: number): boolean {
  if (i === 0) return true;
  return !/[\w]/.test(src[i - 1]!);
}

function skipWs(src: string, i: number): number {
  while (i < src.length && /\s/.test(src[i]!)) i++;
  return i;
}

function readGoString(src: string, start: number): { value: string; end: number } {
  let i = start + 1;
  let value = '';
  while (i < src.length && src[i] !== '"') {
    if (src[i] === '\\' && i + 1 < src.length) {
      value += src[i + 1];
      i += 2;
      continue;
    }
    if (src[i] === '\n') break;
    value += src[i];
    i++;
  }
  if (i < src.length && src[i] === '"') i++;
  return { value, end: i };
}

function skipGoString(src: string, start: number): number {
  return readGoString(src, start).end - 1;
}

function skipGoRaw(src: string, start: number): number {
  let i = start + 1;
  while (i < src.length && src[i] !== '`') i++;
  return i;
}

/** Brace/paren matcher that ignores braces inside Go strings (`{id}` path params). */
function scanBalancedCode(source: string, openIndex: number): string | null {
  const open = source[openIndex]!;
  const close = open === '(' ? ')' : open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    const c = source[i]!;
    if (c === '"') {
      i = skipGoString(source, i);
      continue;
    }
    if (c === '`') {
      i = skipGoRaw(source, i);
      continue;
    }
    if (c === '\'') {
      i = skipGoString(source, i);
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }
  return null;
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
  mountFunc: string | null,
  groupFn: string | null,
  now: number
): void {
  const displayPath = path === '' ? '/' : path.startsWith('/') ? path : `/${path}`;
  const qn =
    `${filePath}::route:${displayPath}` +
    (muxField ? `${GO_MUX_RECEIVER_MARKER}${muxField}` : '') +
    (mountFunc ? `${GO_MOUNT_MARKER}${mountFunc}` : '') +
    (groupFn ? `${GO_GROUP_FN_MARKER}${groupFn}` : '');

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

/**
 * Normalize Fiber/Gin `:id` / `:id?` / `:id<int>` segment params to `{id}`.
 * Colons inside a chi regexp param (`{name:regexp}`) are left alone.
 */
function normalizeGoRoutePath(path: string): string {
  return path.replace(/(^|\/):([A-Za-z_][A-Za-z0-9_]*)(?:<[^>]+>)?\??/g, '$1{$2}');
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
  let rest = qn.slice(start + '::route:'.length);
  for (const marker of [GO_MUX_RECEIVER_MARKER, GO_MOUNT_MARKER, GO_GROUP_FN_MARKER]) {
    const end = rest.indexOf(marker);
    if (end >= 0) rest = rest.slice(0, end);
  }
  return rest;
}

function markerValue(qn: string, marker: string): string | null {
  const i = qn.indexOf(marker);
  if (i < 0) return null;
  const rest = qn.slice(i + marker.length);
  const end = rest.indexOf('::');
  return end >= 0 ? rest.slice(0, end) : rest;
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

/**
 * Compose mux subrouter prefixes and cross-file Mount prefixes onto route
 * names. Both are read from qualifiedName markers so a second pass is a no-op.
 */
export function finalizeGoRouteNames(
  routes: Node[],
  muxPrefixes: Map<string, string>,
  mounts: Map<string, string>,
  groupFnPrefixes?: Map<string, string>
): Node[] {
  const updates: Node[] = [];
  const seen = new Set<string>();
  for (const route of routes) {
    if (route.language !== 'go' || route.kind !== 'route') continue;
    // Only routes this plugin extracted carry `::route:`. Other Go resolvers
    // (GoFrame `g.Meta`) share the language and must keep the path in `name`.
    if (!route.qualifiedName.includes('::route:')) continue;
    let path = routePathFromQualified(route.qualifiedName);
    const method = route.name.split(' ')[0] ?? 'ANY';

    const field = markerValue(route.qualifiedName, GO_MUX_RECEIVER_MARKER);
    if (field) {
      const prefix = muxPrefixes.get(field);
      if (prefix) path = joinGoPath(prefix, path);
    }

    const funcName = markerValue(route.qualifiedName, GO_MOUNT_MARKER);
    if (funcName) {
      const prefix = mountPrefixFor(mounts, route.filePath, funcName);
      if (prefix && prefix !== '/') path = joinGoPath(prefix, path);
    }

    const groupFn = markerValue(route.qualifiedName, GO_GROUP_FN_MARKER);
    if (groupFn && groupFnPrefixes) {
      const prefix = groupFnPrefixes.get(groupFn);
      if (prefix) path = joinGoPath(prefix, path);
    }

    const newName = `${method} ${path}`;
    if (newName === route.name || seen.has(route.id + newName)) continue;
    seen.add(route.id + newName);
    updates.push({ ...route, name: newName });
  }
  return updates;
}

/** `dir::Func` → mount prefix, from `r.Mount("/api/v1", alias.Func())`. */
export function collectGoMountPrefixes(
  files: Array<{ filePath: string; content: string }>,
  modulePath: string | null
): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of files) {
    if (!file.filePath.endsWith('.go') || !file.content.includes('.Mount(')) continue;
    const safe = stripCommentsForRegex(file.content, 'go');
    const imports = parseGoImports(safe);
    const re = /\.Mount\(\s*"([^"]*)"\s*,\s*(?:(\w+)\.)?(\w+)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(safe)) !== null) {
      const prefix = m[1]!;
      const alias = m[2];
      const funcName = m[3]!;
      const dir = alias
        ? moduleDir(imports.get(alias) ?? null, modulePath)
        : posixDir(file.filePath);
      if (dir == null) continue;
      if (!files.some((f) => dirsMatch(posixDir(f.filePath), dir) && goFileHasFunc(f.content, funcName))) {
        continue;
      }
      const key = `${dir}::${funcName}`;
      if (!out.has(key)) out.set(key, prefix.startsWith('/') ? prefix : `/${prefix}`);
    }
  }
  return out;
}

function mountPrefixFor(mounts: Map<string, string>, filePath: string, funcName: string): string | null {
  const dir = posixDir(filePath);
  const exact = mounts.get(`${dir}::${funcName}`);
  if (exact) return exact;
  for (const [key, prefix] of mounts) {
    const sep = key.lastIndexOf('::');
    if (sep < 0) continue;
    const keyDir = key.slice(0, sep);
    const keyFunc = key.slice(sep + 2);
    if (keyFunc === funcName && dirsMatch(dir, keyDir)) return prefix;
  }
  return null;
}

function dirsMatch(fileDir: string, importDir: string): boolean {
  if (fileDir === importDir) return true;
  return importDir.length > 0 && fileDir.endsWith(`/${importDir}`);
}

function moduleDir(importPath: string | null, modulePath: string | null): string | null {
  if (!importPath || !modulePath) return null;
  if (importPath === modulePath) return '';
  if (!importPath.startsWith(`${modulePath}/`)) return null;
  return importPath.slice(modulePath.length + 1);
}

function posixDir(filePath: string): string {
  const norm = filePath.replace(/\\/g, '/');
  const i = norm.lastIndexOf('/');
  return i >= 0 ? norm.slice(0, i) : '';
}

function goFileHasFunc(content: string, name: string): boolean {
  return new RegExp(`\\bfunc\\s*(?:\\([^)]*\\)\\s*)?${name}\\s*\\(`).test(content);
}

function parseGoImports(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const add = (alias: string | undefined, importPath: string) => {
    if (alias === '_' || alias === '.') return;
    const name = alias && alias.length > 0 ? alias : importPath.split('/').pop() ?? importPath;
    out.set(name, importPath);
  };
  const single = /^\s*import\s+(?:(\w+)\s+)?"([^"]+)"/gm;
  let m: RegExpExecArray | null;
  while ((m = single.exec(src)) !== null) add(m[1], m[2]!);
  const block = /^\s*import\s*\(([^)]*)\)/gm;
  while ((m = block.exec(src)) !== null) {
    const body = m[1]!;
    const spec = /(?:(\w+)\s+)?"([^"]+)"/g;
    let s: RegExpExecArray | null;
    while ((s = spec.exec(body)) !== null) add(s[1], s[2]!);
  }
  return out;
}
