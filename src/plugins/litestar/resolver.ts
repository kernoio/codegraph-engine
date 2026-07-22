/**
 * Litestar Framework Resolver (Kerno in-repo plugin)
 *
 * Detects HTTP routes from Litestar semantic decorators (@get/@post/…),
 * generic @route(http_method=…), and Controller.path prefixes.
 *
 * Path params `{name:type}` are normalized to `{name}` for stable route names.
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  UnresolvedRef,
  FrameworkExtractionResult,
  ResolutionContext,
} from '../../resolution/types';
import { stripCommentsForRegex } from '../../resolution/strip-comments';

const SEMANTIC_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
const DECORATOR_NAMES = [...SEMANTIC_METHODS, 'route'] as const;
const DECORATOR_RE = new RegExp(
  `@(${DECORATOR_NAMES.join('|')})\\s*\\(`,
  'g'
);
const CONTROLLER_CLASS_RE =
  /^class\s+(\w+)\s*\(([^)]*)\)\s*:/gm;
const CONTROLLER_PATH_RE = /^\s*path\s*=\s*['"]([^'"]*)['"]/m;
const ROUTER_RE =
  /\bRouter\s*\(\s*(?:path\s*=\s*)?['"]([^'"]*)['"][\s\S]*?route_handlers\s*=\s*\[([^\]]*)\]/g;

export const litestarResolver: FrameworkResolver = {
  name: 'litestar',
  languages: ['python'],

  detect(context) {
    for (const f of ['requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py', 'setup.cfg']) {
      const c = context.readFile(f);
      if (c && /\blitestar\b/i.test(c)) return true;
    }
    const entrypoints = context
      .getAllFiles()
      .filter((f) => /(?:^|\/)(app|application|main|asgi|__init__)\.py$/.test(f))
      .slice(0, 50);
    for (const f of entrypoints) {
      const c = context.readFile(f);
      if (
        c &&
        /\bLitestar\s*\(/.test(c) &&
        (/\bfrom\s+litestar\b/.test(c) || /\bimport\s+litestar\b/.test(c))
      ) {
        return true;
      }
    }
    return false;
  },

  resolve(_ref, _context) {
    return null;
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!filePath.endsWith('.py')) return { nodes: [], references: [] };
    if (!/\blitestar\b/.test(content) && !DECORATOR_RE.test(content)) {
      return { nodes: [], references: [] };
    }
    // Reset lastIndex — DECORATOR_RE is global and was used as a probe above.
    DECORATOR_RE.lastIndex = 0;

    const safe = stripCommentsForRegex(content, 'python');
    return extractFromSafe(filePath, safe);
  },

  /**
   * Apply Router(path=…) prefixes declared in any file onto routes whose
   * handler class/function appears in that router's route_handlers list.
   * Preserves node id and qualifiedName (original in-file path encoding).
   */
  postExtract(context: ResolutionContext): Node[] {
    const handlerPrefixes = collectRouterPrefixes(context);
    if (handlerPrefixes.size === 0) return [];

    const updates: Node[] = [];
    for (const route of context.getNodesByKind('route')) {
      if (route.language !== 'python') continue;
      const meta = parseRouteMeta(route);
      if (!meta?.handler) continue;
      const prefixes = handlerPrefixes.get(meta.handler);
      if (!prefixes?.length) continue;

      // Prefer the longest prefix when a handler is mounted under multiple routers.
      const prefix = prefixes.reduce((a, b) => (a.length >= b.length ? a : b));
      const fullPath = joinPath(prefix, meta.path);
      const newName = `${meta.method} ${fullPath}`;
      if (route.name === newName) continue;
      updates.push({ ...route, name: newName, updatedAt: Date.now() });
    }
    return updates;
  },
};

interface ControllerScope {
  className: string;
  path: string;
  start: number;
  end: number;
}

interface DecoratorHit {
  name: string;
  args: string;
  index: number;
  end: number;
}

interface RouteMeta {
  method: string;
  path: string;
  handler: string;
}

function extractFromSafe(filePath: string, safe: string): FrameworkExtractionResult {
  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();
  const scopes = buildControllerScopes(safe);

  for (const hit of findDecorators(safe)) {
    const line = lineAt(safe, hit.index);
    const scope = scopeFor(scopes, hit.index);
    const prefix = scope?.path ?? '';

    const { paths, methods } = parseDecoratorCall(hit.name, hit.args);
    if (methods.length === 0) continue;

    const handler = methodNameAfter(safe, hit.end);
    // Router(route_handlers=[…]) lists controller classes or free functions — not methods.
    const mountKey = scope?.className ?? handler;
    for (const method of methods) {
      for (const rawPath of paths) {
        const routePath = normalizePathParams(joinPath(prefix, rawPath));
        const name = `${method} ${routePath}`;
        const routeNode: Node = {
          id: `route:${filePath}:${line}:${method}:${routePath}:${handler ?? ''}`,
          kind: 'route',
          name,
          qualifiedName: `${filePath}::route:${method}:${routePath}`,
          filePath,
          startLine: line,
          endLine: line,
          startColumn: 0,
          endColumn: hit.end - hit.index,
          language: 'python',
          // Mount key for postExtract Router prefixes (class or free-function name).
          signature: mountKey ? `handler:${mountKey}` : undefined,
          updatedAt: now,
        };
        nodes.push(routeNode);
        if (handler) {
          references.push({
            fromNodeId: routeNode.id,
            referenceName: handler,
            referenceKind: 'references',
            line,
            column: 0,
            filePath,
            language: 'python',
          });
        }
      }
    }
  }

  return { nodes, references };
}

function buildControllerScopes(safe: string): ControllerScope[] {
  const scopes: ControllerScope[] = [];
  const classRe = new RegExp(CONTROLLER_CLASS_RE.source, 'gm');
  const matches: { className: string; bases: string; index: number; bodyStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = classRe.exec(safe)) !== null) {
    matches.push({
      className: m[1]!,
      bases: m[2]!,
      index: m.index,
      bodyStart: m.index + m[0].length,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const end = i + 1 < matches.length ? matches[i + 1]!.index : safe.length;
    const body = safe.slice(cur.bodyStart, end);
    // Controllers subclass Controller (possibly via an alias / intermediate).
    // Require an explicit Controller base OR a `path =` class attr with litestar
    // method decorators in the body — avoids random classes with a path attr.
    const looksLikeController =
      /\bController\b/.test(cur.bases) ||
      (CONTROLLER_PATH_RE.test(body) && /@(?:get|post|put|patch|delete|head|options|route)\s*\(/.test(body));
    if (!looksLikeController) continue;
    const pathMatch = body.match(CONTROLLER_PATH_RE);
    scopes.push({
      className: cur.className,
      path: pathMatch?.[1] ?? '',
      start: cur.index,
      end,
    });
  }
  return scopes;
}

function scopeFor(scopes: ControllerScope[], index: number): ControllerScope | undefined {
  return scopes.find((s) => index >= s.start && index < s.end);
}

function findDecorators(safe: string): DecoratorHit[] {
  const hits: DecoratorHit[] = [];
  const re = new RegExp(DECORATOR_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    const name = m[1]!;
    const argsStart = m.index + m[0].length;
    const argsEnd = findMatchingParen(safe, argsStart - 1);
    if (argsEnd < 0) continue;
    hits.push({
      name,
      args: safe.slice(argsStart, argsEnd),
      index: m.index,
      end: argsEnd + 1,
    });
    re.lastIndex = argsEnd + 1;
  }
  return hits;
}

function parseDecoratorCall(
  decoratorName: string,
  args: string
): { paths: string[]; methods: string[] } {
  let methods: string[];
  if (decoratorName === 'route') {
    methods = parseHttpMethods(args);
  } else {
    methods = [decoratorName.toUpperCase()];
  }

  const paths = parsePaths(args);
  return { paths: paths.length ? paths : [''], methods };
}

function parsePaths(args: string): string[] {
  const pathKw = args.match(/\bpath\s*=\s*/);
  if (pathKw && pathKw.index != null) {
    return parseStringOrList(args.slice(pathKw.index + pathKw[0].length));
  }

  // First positional: string or list — skip if it looks like a keyword-only call.
  const trimmed = args.trimStart();
  if (!trimmed || /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(trimmed)) {
    return [];
  }
  return parseStringOrList(trimmed);
}

function parseStringOrList(src: string): string[] {
  const s = src.trimStart();
  if (s.startsWith('[') || s.startsWith('(')) {
    const close = s[0] === '[' ? ']' : ')';
    const end = findMatching(s, 0, s[0]!, close);
    if (end < 0) return [];
    const inner = s.slice(1, end);
    const out: string[] = [];
    const re = /['"]([^'"]*)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(inner)) !== null) out.push(m[1]!);
    return out;
  }
  const one = s.match(/^['"]([^'"]*)['"]/);
  return one ? [one[1]!] : [];
}

function parseHttpMethods(args: string): string[] {
  const m = args.match(/\bhttp_method\s*=\s*(\[[^\]]*\]|[A-Za-z0-9_.]+)/);
  if (!m) return [];
  const raw = m[1]!;
  const found: string[] = [];
  const re = /(?:HttpMethod\.)?([A-Z]+)|['"]([A-Za-z]+)['"]/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(raw)) !== null) {
    const verb = (hit[1] || hit[2] || '').toUpperCase();
    if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(verb)) {
      found.push(verb);
    }
  }
  return [...new Set(found)];
}

function collectRouterPrefixes(context: ResolutionContext): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const filePath of context.getAllFiles()) {
    if (!filePath.endsWith('.py')) continue;
    const content = context.readFile(filePath);
    if (!content || !content.includes('Router')) continue;
    const safe = stripCommentsForRegex(content, 'python');
    const re = new RegExp(ROUTER_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(safe)) !== null) {
      const prefix = m[1]!;
      for (const name of parseHandlerList(m[2]!)) {
        const list = map.get(name) ?? [];
        list.push(prefix);
        map.set(name, list);
      }
    }
  }
  return map;
}

function parseHandlerList(inner: string): string[] {
  const names: string[] = [];
  const re = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    const name = m[1]!;
    if (name === 'route_handlers') continue;
    names.push(name);
  }
  return names;
}

function parseRouteMeta(route: Node): RouteMeta | null {
  const nameMatch = route.name.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/\S*)$/);
  if (!nameMatch) return null;
  const handler =
    route.signature?.startsWith('handler:') ? route.signature.slice('handler:'.length) : '';
  // Recover the pre-router path from qualifiedName when name has already been remounted.
  let path = nameMatch[2]!;
  const q = route.qualifiedName.match(/::route:(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS):(.+)$/);
  if (q) path = q[1]!;
  return { method: nameMatch[1]!, path, handler };
}

function methodNameAfter(safe: string, from: number): string | undefined {
  const tail = safe.slice(from);
  const m = tail.match(/^\s*(?:async\s+)?def\s+(\w+)/);
  return m?.[1];
}

function joinPath(prefix: string, suffix: string): string {
  const p = (prefix || '').replace(/\/+$/, '');
  const s = (suffix || '').replace(/^\/+/, '');
  if (!s) return p || '/';
  if (!p) return `/${s}`;
  return `${p}/${s}`;
}

function normalizePathParams(path: string): string {
  return path.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\s*:[^}]+\}/g, '{$1}');
}

function lineAt(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}

function findMatchingParen(src: string, openIndex: number): number {
  return findMatching(src, openIndex, '(', ')');
}

function findMatching(src: string, openIndex: number, openCh: string, closeCh: string): number {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = openIndex; i < src.length; i++) {
    const ch = src[i]!;
    if (inStr) {
      if (ch === '\\' && inStr !== "'''" && inStr !== '"""') {
        i++;
        continue;
      }
      if (inStr.length === 1 && ch === inStr) {
        inStr = null;
      } else if (inStr.length === 3 && src.startsWith(inStr, i)) {
        inStr = null;
        i += 2;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      if (src.startsWith(ch + ch + ch, i)) {
        inStr = ch + ch + ch;
        i += 2;
      } else {
        inStr = ch;
      }
      continue;
    }
    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
