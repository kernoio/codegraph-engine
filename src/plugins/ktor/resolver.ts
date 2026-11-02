/**
 * Ktor HTTP routing DSL (Kerno in-repo plugin)
 *
 * Covers `routing { get("/x") }`, nested `route("/prefix") { … }`, verb helpers
 * without a path (inherit parent), `route("/x", HttpMethod.Get)`, user helpers that
 * delegate to `route(path) { … }`, and receiver-style `route.get("/segment")`.
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  UnresolvedRef,
  ResolvedRef,
  ResolutionContext,
  FrameworkExtractionResult,
} from '../../resolution/types';
import { stripCommentsForRegex } from '../../resolution/strip-comments';

const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

const HTTP_METHOD_FROM_ARG: Record<string, string> = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE',
  Head: 'HEAD',
  Options: 'OPTIONS',
};

export const ktorResolver: FrameworkResolver = {
  name: 'ktor',
  languages: ['kotlin'],

  detect(context: ResolutionContext): boolean {
    for (const filePath of context.getAllFiles()) {
      if (
        filePath.endsWith('build.gradle.kts') ||
        filePath.endsWith('build.gradle') ||
        filePath.endsWith('pom.xml')
      ) {
        const content = context.readFile(filePath);
        if (content && /io\.ktor:ktor-server/.test(content)) return true;
      }
    }

    return context.getAllFiles().some((f) => {
      if (!f.endsWith('.kt')) return false;
      const content = context.readFile(f);
      if (!content) return false;
      return (
        /io\.ktor\.server\.routing/.test(content) ||
        /\bimport\s+io\.ktor\.server\.routing\b/.test(content)
      );
    });
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    const candidates = context.getNodesByName(ref.referenceName);
    const hit = candidates.find((n) => n.kind === 'function' || n.kind === 'method');
    if (!hit) return null;
    return {
      original: ref,
      targetNodeId: hit.id,
      confidence: 0.8,
      resolvedBy: 'framework',
    };
  },

  extract(filePath, content): FrameworkExtractionResult {
    return extractKtorRoutes(filePath, content);
  },
};

export function extractKtorRoutes(filePath: string, content: string): FrameworkExtractionResult {
  if (!filePath.endsWith('.kt')) return { nodes: [], references: [] };
  // Avoid RestAssured/client helpers named get/post — require a Ktor routing signal.
  if (
    !/io\.ktor\.server\.routing/.test(content) &&
    !/\bfun\s+Route\./.test(content) &&
    !/\brouting\s*\{/.test(content)
  ) {
    return { nodes: [], references: [] };
  }

  const safe = stripCommentsForRegex(content, 'java');
  const routeDelegates = collectRouteDelegateNames(safe);
  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();

  const prefixStack: string[] = [''];
  type BraceKind = 'route' | 'other';
  const braceStack: BraceKind[] = [];

  const tryRouteMount = (name: string, start: number, openParen: number): number | null => {
    const args = parseCallArgs(safe, openParen);
    if (!args) return null;
    const pathLit = firstStringArg(args.inner);
    if (pathLit == null) return null;
    const httpMethod = name === 'route' ? parseHttpMethodArg(args.inner) : null;
    let k = skipWs(safe, args.end);
    if (safe[k] !== '{') return null;
    const full = joinPaths(prefixStack[prefixStack.length - 1]!, pathLit);
    if (httpMethod && pathLit != null) {
      pushRoute(nodes, filePath, lineAt(safe, start), httpMethod, full, now, k - start);
    }
    prefixStack.push(full === '/' ? '' : full);
    braceStack.push('route');
    return k + 1;
  };

  const tryVerb = (name: string, start: number, afterName: number, hadTypeArgs: boolean): number | null => {
    let j = afterName;
    if (safe[j] === '(') {
      const args = parseCallArgs(safe, j);
      if (!args) return null;
      const pathLit = firstStringArg(args.inner);
      const methodRef = parseMethodRef(args.inner);
      const prefix = prefixStack[prefixStack.length - 1]!;
      // Type-safe Resources: get<Articles> { … } with no string path — skip
      if (!(hadTypeArgs && pathLit == null) && shouldEmitVerbWithParenArgs(prefix, args.inner, pathLit)) {
        const full = joinPaths(prefix, pathLit ?? '');
        const routeNode = pushRoute(
          nodes,
          filePath,
          lineAt(safe, start),
          name.toUpperCase(),
          full,
          now,
          args.end - start
        );
        if (methodRef) {
          references.push({
            fromNodeId: routeNode.id,
            referenceName: methodRef,
            referenceKind: 'references',
            line: routeNode.startLine,
            column: 0,
            filePath,
            language: 'kotlin',
          });
        }
      }
      let k = skipWs(safe, args.end);
      if (safe[k] === '{') {
        braceStack.push('other');
        return k + 1;
      }
      return args.end;
    }
    if (safe[j] === '{') {
      if (!hadTypeArgs) {
        const full = joinPaths(prefixStack[prefixStack.length - 1]!, '');
        pushRoute(nodes, filePath, lineAt(safe, start), name.toUpperCase(), full, now, j - start);
      }
      braceStack.push('other');
      return j + 1;
    }
    return null;
  };

  const tryRoutingToken = (start: number): number | null => {
    const identMatch = safe.slice(start).match(/^([A-Za-z_]\w*)/);
    if (!identMatch) return null;
    const name = identMatch[1]!;
    const isBuiltinRoute = name === 'route' || VERBS.has(name);
    if (!isBuiltinRoute && !routeDelegates.has(name)) return null;
    let j = start + name.length;
    j = skipWs(safe, j);

    let hadTypeArgs = false;
    if (safe[j] === '<') {
      const after = skipTypeArgs(safe, j);
      if (after > j) {
        hadTypeArgs = true;
        j = skipWs(safe, after);
      }
    }

    if (name === 'route' && safe[j] === '(') {
      return tryRouteMount(name, start, j);
    }
    if (routeDelegates.has(name) && safe[j] === '(') {
      return tryRouteMount(name, start, j);
    }
    if (VERBS.has(name)) {
      return tryVerb(name, start, j, hadTypeArgs);
    }
    return null;
  };

  let i = 0;
  while (i < safe.length) {
    const c = safe[i]!;

    if (c === '"' || c === "'" || c === '`') {
      i = skipString(safe, i);
      continue;
    }

    if (c === '.' && isIdentStart(safe[i + 1]!)) {
      const next = tryRoutingToken(i + 1);
      if (next != null) {
        i = next;
        continue;
      }
    }

    if (isIdentStart(c) && (i === 0 || !isIdentContinue(safe[i - 1]!)) && safe[i - 1] !== '.') {
      const next = tryRoutingToken(i);
      if (next != null) {
        i = next;
        continue;
      }
    }

    if (c === '{') {
      braceStack.push('other');
      i++;
      continue;
    }
    if (c === '}') {
      const kind = braceStack.pop();
      if (kind === 'route') {
        prefixStack.pop();
        if (prefixStack.length === 0) prefixStack.push('');
      }
      i++;
      continue;
    }

    i++;
  }

  return { nodes, references };
}

function pushRoute(
  nodes: Node[],
  filePath: string,
  line: number,
  method: string,
  routePath: string,
  now: number,
  colLen: number
): Node {
  const path = normalizePath(routePath || '/');
  const node: Node = {
    id: `route:${filePath}:${line}:${method}:${path}`,
    kind: 'route',
    name: `${method} ${path}`,
    qualifiedName: `${filePath}::route:${method}:${path}`,
    filePath,
    startLine: line,
    endLine: line,
    startColumn: 0,
    endColumn: Math.max(colLen, 1),
    language: 'kotlin',
    updatedAt: now,
  };
  nodes.push(node);
  return node;
}

function normalizePath(p: string): string {
  if (!p || p === '/') return '/';
  let s = p.startsWith('/') ? p : `/${p}`;
  s = s.replace(/\/+/g, '/');
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

function joinPaths(prefix: string, segment: string): string {
  if (!segment) return normalizePath(prefix || '/');
  if (!prefix) return normalizePath(segment);
  const a = prefix.replace(/\/+$/, '');
  const b = segment.replace(/^\/+/, '');
  return normalizePath(`${a}/${b}`);
}

function firstStringArg(inner: string): string | null {
  const m = inner.match(/^\s*"([^"]*)"/);
  return m ? m[1]! : null;
}

/** User helpers like `applicationRoute(path) { route(path) { … } }`. */
function collectRouteDelegateNames(content: string): Set<string> {
  const names = new Set<string>();
  const funRe = /\bfun\s+(?:[\w.]+\.)?(\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = funRe.exec(content)) !== null) {
    const fnName = m[1]!;
    if (fnName === 'Route' || VERBS.has(fnName)) continue;
    const openParen = m.index + m[0].length - 1;
    const closeParen = findMatchingParen(content, openParen);
    if (closeParen < 0) continue;
    const params = content.slice(openParen + 1, closeParen);
    const firstStringParam = params.match(/^\s*(\w+)\s*:\s*String\b/);
    if (!firstStringParam) continue;
    const paramName = firstStringParam[1]!;
    let i = skipWs(content, closeParen + 1);
    if (content[i] === ':') {
      i++;
      while (i < content.length && content[i] !== '{') {
        if (content[i] === '(') {
          const end = findMatchingParen(content, i);
          i = end >= 0 ? end + 1 : i + 1;
          continue;
        }
        i++;
      }
    }
    if (content[i] !== '{') continue;
    const bodySlice = content.slice(i + 1, i + 1 + 500);
    if (new RegExp(`\\broute\\s*\\(\\s*${paramName}\\b`).test(bodySlice)) {
      names.add(fnName);
    }
  }
  return names;
}

function findMatchingParen(src: string, openIdx: number): number {
  if (src[openIdx] !== '(') return -1;
  let depth = 1;
  let i = openIdx + 1;
  while (i < src.length && depth > 0) {
    const c = src[i]!;
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(src, i);
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/** Skip `get(path)` inside Route extension helpers (false GET /) and other non-literal paths at root. */
function shouldEmitVerbWithParenArgs(
  prefix: string,
  argsInner: string,
  pathLit: string | null
): boolean {
  if (pathLit != null) return true;
  const trimmed = argsInner.trim();
  if (!trimmed) return !!prefix;
  if (/^::/.test(trimmed) || /^[\w.]+\s*::/.test(trimmed)) return !!prefix;
  return false;
}

function parseHttpMethodArg(inner: string): string | null {
  const m = inner.match(/\bHttpMethod\.(Get|Post|Put|Patch|Delete|Head|Options)\b/);
  if (!m) return null;
  return HTTP_METHOD_FROM_ARG[m[1]!] ?? null;
}

function parseMethodRef(inner: string): string | null {
  // get("/x", ::handler) or get("/x", Foo::bar)
  const m = inner.match(/,\s*(?:[A-Za-z_][\w.]*)?::([A-Za-z_]\w*)\s*$/);
  return m ? m[1]! : null;
}

function parseCallArgs(src: string, openParenIdx: number): { inner: string; end: number } | null {
  if (src[openParenIdx] !== '(') return null;
  let i = openParenIdx + 1;
  let depth = 1;
  const start = i;
  while (i < src.length && depth > 0) {
    const c = src[i]!;
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(src, i);
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) {
        return { inner: src.slice(start, i), end: i + 1 };
      }
    }
    i++;
  }
  return null;
}

function skipTypeArgs(src: string, openIdx: number): number {
  if (src[openIdx] !== '<') return openIdx;
  let i = openIdx + 1;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const c = src[i]!;
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(src, i);
      continue;
    }
    if (c === '<') depth++;
    else if (c === '>') depth--;
    i++;
  }
  return i;
}

function skipString(src: string, i: number): number {
  const quote = src[i]!;
  i++;
  while (i < src.length) {
    if (src[i] === '\\' && i + 1 < src.length) {
      i += 2;
      continue;
    }
    if (src[i] === quote) return i + 1;
    if (quote !== '`' && src[i] === '\n') return i;
    i++;
  }
  return i;
}

function skipWs(src: string, i: number): number {
  while (i < src.length && /\s/.test(src[i]!)) i++;
  return i;
}

function isIdentStart(c: string): boolean {
  return /[A-Za-z_]/.test(c);
}

function isIdentContinue(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c);
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}
