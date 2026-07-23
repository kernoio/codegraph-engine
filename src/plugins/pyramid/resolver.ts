/**
 * Pyramid (Python) URL-dispatch route discovery.
 *
 * Covers imperative `config.add_route` / `config.add_view` and declarative
 * `@view_config(route_name=…)` attachments where the path is statically
 * recoverable. Traversal-only apps and dynamic `include(..., route_prefix=)`
 * mounts that resolve across packages are intentionally left uncovered.
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

interface RouteDef {
  name: string;
  pattern: string;
  method: string | null;
  index: number;
  length: number;
}

interface ViewAttach {
  routeName: string;
  method: string | null;
  handler: string | null;
  index: number;
}

const MANIFEST_FILES = ['requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py', 'setup.cfg'];

export const pyramidResolver: FrameworkResolver = {
  name: 'pyramid',
  languages: ['python'],

  detect(context: ResolutionContext): boolean {
    for (const f of MANIFEST_FILES) {
      const c = context.readFile(f);
      if (c && /(^|[\s"'\[\],=><~!])pyramid([\s"'\[\],=><~!]|$)/i.test(c)) return true;
    }
    // Bounded content scan: Configurator + add_route is the URL-dispatch signal.
    for (const file of context.getAllFiles()) {
      if (!file.endsWith('.py')) continue;
      const content = context.readFile(file);
      if (!content) continue;
      if (
        /\bfrom\s+pyramid\.config\s+import\b|\bimport\s+pyramid\.config\b/.test(content) &&
        /\.add_route\s*\(/.test(content)
      ) {
        return true;
      }
    }
    return false;
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    const candidates = context
      .getNodesByName(ref.referenceName)
      .filter((n) => n.kind === 'function' || n.kind === 'method' || n.kind === 'class');
    if (candidates.length === 0) return null;
    const sameFile = candidates.find((n) => n.filePath === ref.filePath);
    const target = sameFile ?? candidates[0]!;
    return {
      original: ref,
      targetNodeId: target.id,
      confidence: sameFile ? 0.9 : 0.75,
      resolvedBy: 'framework',
    };
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!filePath.endsWith('.py')) return { nodes: [], references: [] };
    const safe = stripCommentsForRegex(content, 'python');
    const routes = collectAddRoutes(safe);
    if (routes.length === 0 && !/\bview_config\b|\.add_view\s*\(/.test(safe)) {
      return { nodes: [], references: [] };
    }

    const attachments = [
      ...collectAddViews(safe),
      ...collectViewConfigs(safe),
    ];
    const byName = groupAttachments(attachments);

    const nodes: Node[] = [];
    const references: UnresolvedRef[] = [];
    const now = Date.now();
    const emitted = new Set<string>();

    for (const route of routes) {
      const attaches = byName.get(route.name) ?? [];
      const methods = resolveMethods(route.method, attaches);
      const line = lineAt(safe, route.index);

      for (const method of methods) {
        const key = `${method} ${route.pattern}`;
        if (emitted.has(key)) continue;
        emitted.add(key);

        const routeNode: Node = {
          id: `route:${filePath}:${line}:${method}:${route.pattern}`,
          kind: 'route',
          name: `${method} ${route.pattern}`,
          // Embed the Pyramid route name so postExtract can join cross-file
          // @view_config(request_method=…) attachments. Shape is stable across
          // verb upgrades (idempotent postExtract).
          qualifiedName: `${filePath}::pyramid:${route.name}:${method}:${route.pattern}`,
          filePath,
          startLine: line,
          endLine: line,
          startColumn: 0,
          endColumn: route.length,
          language: 'python',
          updatedAt: now,
        };
        nodes.push(routeNode);

        const handlers = attaches
          .filter((a) => a.handler && (!a.method || a.method === method || method === 'ANY'))
          .map((a) => a.handler!);
        for (const handler of unique(handlers)) {
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

    return { nodes, references };
  },

  /**
   * Cross-file: when `@view_config(route_name=…, request_method=…)` lives in a
   * different module than `add_route`, upgrade ANY routes to the view's verb(s)
   * and leave the node id stable so existing edges stay intact.
   */
  postExtract(context: ResolutionContext): Node[] {
    const routeNameToPattern = new Map<string, string>();
    const routeNameToMethods = new Map<string, Set<string>>();

    for (const filePath of context.getAllFiles()) {
      if (!filePath.endsWith('.py')) continue;
      const content = context.readFile(filePath);
      if (!content) continue;
      const safe = stripCommentsForRegex(content, 'python');

      for (const route of collectAddRoutes(safe)) {
        if (!routeNameToPattern.has(route.name)) {
          routeNameToPattern.set(route.name, route.pattern);
        }
        if (route.method) {
          const set = routeNameToMethods.get(route.name) ?? new Set();
          set.add(route.method);
          routeNameToMethods.set(route.name, set);
        }
      }
      for (const attach of [...collectAddViews(safe), ...collectViewConfigs(safe)]) {
        if (!attach.method) continue;
        const set = routeNameToMethods.get(attach.routeName) ?? new Set();
        set.add(attach.method);
        routeNameToMethods.set(attach.routeName, set);
      }
    }

    const updates: Node[] = [];
    const routes =
      context.iterateNodesByKind?.('route') != null
        ? Array.from(context.iterateNodesByKind!('route'))
        : context.getNodesByKind('route');

    for (const node of routes) {
      const parsed = parsePyramidQualifiedName(node.qualifiedName);
      if (!parsed) continue;
      if (!node.name.startsWith('ANY ')) continue;

      const methods = routeNameToMethods.get(parsed.routeName);
      if (!methods || methods.size !== 1) continue;
      const method = [...methods][0]!;
      const pattern = routeNameToPattern.get(parsed.routeName) ?? parsed.pattern;
      const updated: Node = {
        ...node,
        name: `${method} ${pattern}`,
        // Keep qualifiedName stable for idempotency (postExtract contract).
      };
      if (updated.name !== node.name) updates.push(updated);
    }

    return updates;
  },
};

function collectAddRoutes(safe: string): RouteDef[] {
  const routes: RouteDef[] = [];
  // Match config.add_route(...) / self.config.add_route(...) including multiline args.
  const re = /\.add_route\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    const open = m.index + m[0].length - 1;
    const parsed = readCallArgs(safe, open);
    if (!parsed) continue;
    const args = splitTopLevelArgs(parsed.args);
    if (args.length === 0) continue;

    const name = parseStringArg(args[0]!) ?? namedString(args, 'name');
    let pattern =
      (args.length >= 2 ? parseStringArg(args[1]!) : null) ??
      namedString(args, 'pattern') ??
      namedString(args, 'path');
    if (!name || pattern == null) continue;

    pattern = normalizePattern(pattern);
    const method = parseRequestMethod(parsed.args);
    routes.push({
      name,
      pattern,
      method,
      index: m.index,
      length: parsed.end - m.index,
    });
    re.lastIndex = parsed.end;
  }
  return routes;
}

function collectAddViews(safe: string): ViewAttach[] {
  const out: ViewAttach[] = [];
  const re = /\.add_view\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    const open = m.index + m[0].length - 1;
    const parsed = readCallArgs(safe, open);
    if (!parsed) continue;
    const args = splitTopLevelArgs(parsed.args);
    const routeName = namedString(args, 'route_name');
    if (!routeName) {
      re.lastIndex = parsed.end;
      continue;
    }
    // Exception / context views without URL dispatch are skipped above (no route_name).
    let handler: string | null = null;
    if (args.length > 0 && !/^\w+\s*=/.test(args[0]!.trim())) {
      handler = handlerSymbol(args[0]!.trim());
    }
    out.push({
      routeName,
      method: parseRequestMethod(parsed.args),
      handler,
      index: m.index,
    });
    re.lastIndex = parsed.end;
  }
  return out;
}

function collectViewConfigs(safe: string): ViewAttach[] {
  const out: ViewAttach[] = [];
  // @view_config(...) or @pyramid.view.view_config(...)
  const re = /@(?:[\w.]+\.)?view_config\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    const open = m.index + m[0].length - 1;
    const parsed = readCallArgs(safe, open);
    if (!parsed) continue;
    const args = splitTopLevelArgs(parsed.args);
    const routeName = namedString(args, 'route_name');
    if (!routeName) {
      re.lastIndex = parsed.end;
      continue;
    }
    const tail = safe.slice(parsed.end);
    const defMatch = tail.match(/^\s*(?:@[\w.()=,'"\s]+\s*)*(?:async\s+)?def\s+(\w+)/);
    const classMatch = !defMatch
      ? tail.match(/^\s*(?:@[\w.()=,'"\s]+\s*)*class\s+(\w+)/)
      : null;
    out.push({
      routeName,
      method: parseRequestMethod(parsed.args),
      handler: defMatch?.[1] ?? classMatch?.[1] ?? null,
      index: m.index,
    });
    re.lastIndex = parsed.end;
  }
  return out;
}

function resolveMethods(routeMethod: string | null, attaches: ViewAttach[]): string[] {
  if (routeMethod) return [routeMethod];
  const fromViews = unique(attaches.map((a) => a.method).filter((m): m is string => !!m));
  if (fromViews.length > 0) return fromViews;
  return ['ANY'];
}

function groupAttachments(attaches: ViewAttach[]): Map<string, ViewAttach[]> {
  const map = new Map<string, ViewAttach[]>();
  for (const a of attaches) {
    const list = map.get(a.routeName) ?? [];
    list.push(a);
    map.set(a.routeName, list);
  }
  return map;
}

function normalizePattern(pattern: string): string {
  let p = pattern.trim();
  if (p === '') return '/';
  // Pyramid allows patterns without a leading slash.
  if (!p.startsWith('/') && !p.startsWith('*')) p = `/${p}`;
  else if (p.startsWith('*')) p = `/${p}`;
  return p;
}

function parseRequestMethod(argsSrc: string): string | null {
  // request_method='GET' | "POST" | ('GET', 'POST') | ["GET"]
  const single = argsSrc.match(/\brequest_method\s*=\s*['"]([A-Za-z]+)['"]/);
  if (single) return single[1]!.toUpperCase();

  const multi = argsSrc.match(/\brequest_method\s*=\s*(\([^)]*\)|\[[^\]]*\])/);
  if (multi) {
    const verbs = [...multi[1]!.matchAll(/['"]([A-Za-z]+)['"]/g)].map((x) => x[1]!.toUpperCase());
    // Multiple verbs on the route predicate → emit nothing here; caller may
    // expand. For a single-element tuple/list, return that verb.
    if (verbs.length === 1) return verbs[0]!;
    // For multi-verb predicates, treat as ANY (one route matching those methods).
    if (verbs.length > 1) return 'ANY';
  }
  return null;
}

function parseStringArg(arg: string): string | null {
  const m = arg.trim().match(/^['"]([^'"]*)['"]/);
  return m ? m[1]! : null;
}

function namedString(args: string[], key: string): string | null {
  const re = new RegExp(`^${key}\\s*=\\s*['"]([^'"]*)['"]`);
  for (const a of args) {
    const m = a.trim().match(re);
    if (m) return m[1]!;
  }
  return null;
}

function handlerSymbol(expr: string): string | null {
  // 'pkg.views.home' or pkg.views.home or handler.handle
  const str = expr.match(/^['"]([\w.]+)['"]$/);
  const raw = str ? str[1]! : expr.replace(/\(.*\)$/, '').trim();
  if (!/^[\w.]+$/.test(raw)) return null;
  const parts = raw.split('.').filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

/** Read balanced (...) args starting at the '(' index. */
function readCallArgs(src: string, openParen: number): { args: string; end: number } | null {
  if (src[openParen] !== '(') return null;
  let depth = 0;
  let inStr: string | null = null;
  for (let i = openParen; i < src.length; i++) {
    const ch = src[i]!;
    const prev = src[i - 1];
    if (inStr) {
      if (ch === inStr && prev !== '\\') inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inStr = ch;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return { args: src.slice(openParen + 1, i), end: i + 1 };
      }
    }
  }
  return null;
}

function splitTopLevelArgs(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr: string | null = null;
  let start = 0;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i]!;
    const prev = args[i - 1];
    if (inStr) {
      if (ch === inStr && prev !== '\\') inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inStr = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(args.slice(start, i));
      start = i + 1;
    }
  }
  const tail = args.slice(start).trim();
  if (tail) parts.push(args.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function lineAt(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/** Parse `file::pyramid:<routeName>:<METHOD>:<pattern>` from extract(). */
function parsePyramidQualifiedName(
  qn: string
): { routeName: string; method: string; pattern: string } | null {
  const marker = '::pyramid:';
  const idx = qn.indexOf(marker);
  if (idx < 0) return null;
  const rest = qn.slice(idx + marker.length);
  // routeName may contain almost anything except our separators; method is
  // uppercase / ANY; pattern starts with / or *.
  const m = rest.match(/^([^:]+):([A-Z]+):(.+)$/);
  if (!m) return null;
  return { routeName: m[1]!, method: m[2]!, pattern: m[3]! };
}
