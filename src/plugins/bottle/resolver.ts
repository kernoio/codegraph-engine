/**
 * Bottle Framework Resolver (Kerno in-repo plugin)
 *
 * Detects HTTP routes from Bottle decorator and callback registration:
 *   - @route('/path') / @route('/path', method='POST'|['GET','POST'])
 *   - @get/@post/@put/@patch/@delete('/path')  (module-level or @app.*)
 *   - @app.route(...) on an explicit Bottle() instance
 *   - route(..., callback=handler) / app.route(..., callback=handler)
 *
 * Path wildcards `<name>`, `<name:filter>`, and legacy `:name` normalize to `{name}`.
 *
 * Known gaps (precision over recall):
 * - app.mount('/prefix', subapp) cross-app prefix composition
 * - Bottle.merge / dynamic non-literal paths
 * - Auto-generated paths when route() is called with path=None
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  UnresolvedRef,
  FrameworkExtractionResult,
  ResolutionContext,
} from '../../resolution/types';
import { stripCommentsForRegex } from '../../resolution/strip-comments';

const SHORTHAND_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const MANIFEST_FILES = ['requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py', 'setup.cfg'];
/** Package-name style match — avoid "bottleneck". */
const BOTTLE_DEP = /(^|[\s"'=\[]|dependencies\.)bottle([\s"'>=<\],|]|$)/im;
const BOTTLE_IMPORT = /\bfrom\s+bottle\b|\bimport\s+bottle\b/;
const BOTTLE_SIGNAL =
  /@\w*\.?route\s*\(|@(?:get|post|put|patch|delete)\s*\(|\bBottle\s*\(/;

export const bottleResolver: FrameworkResolver = {
  name: 'bottle',
  languages: ['python'],

  detect(context: ResolutionContext): boolean {
    for (const file of MANIFEST_FILES) {
      const content = context.readFile(file);
      if (content && BOTTLE_DEP.test(content)) return true;
    }
    // Nested packages / poetry lockfiles mentioning bottle.
    for (const file of context.getAllFiles()) {
      const base = file.split('/').pop() ?? '';
      if (
        (base === 'requirements.txt' ||
          base === 'pyproject.toml' ||
          base === 'Pipfile' ||
          base === 'setup.py' ||
          base === 'setup.cfg') &&
        BOTTLE_DEP.test(context.readFile(file) ?? '')
      ) {
        return true;
      }
    }
    const entrypoints = context
      .getAllFiles()
      .filter((f) => /(?:^|\/)(app|application|main|server|wsgi|__init__)\.py$/.test(f))
      .slice(0, 50);
    for (const f of entrypoints) {
      const c = context.readFile(f);
      if (
        c &&
        BOTTLE_IMPORT.test(c) &&
        (/\bBottle\s*\(/.test(c) || BOTTLE_SIGNAL.test(c))
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
    // Require a Bottle import in-file so bare @route/@get from other libs don't match.
    if (!BOTTLE_IMPORT.test(content)) {
      return { nodes: [], references: [] };
    }
    if (!BOTTLE_SIGNAL.test(content) && !/\.route\s*\(/.test(content)) {
      return { nodes: [], references: [] };
    }

    const safe = stripCommentsForRegex(content, 'python');
    return extractFromSafe(filePath, safe);
  },
};

interface RouteHit {
  index: number;
  end: number;
  methods: string[];
  paths: string[];
  handler: string | null;
}

function extractFromSafe(filePath: string, safe: string): FrameworkExtractionResult {
  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();
  const hits = collectRouteHits(safe);

  for (const hit of hits) {
    const line = lineAt(safe, hit.index);
    for (const method of hit.methods) {
      for (const rawPath of hit.paths) {
        const routePath = normalizePathParams(rawPath || '/');
        const name = `${method} ${routePath}`;
        const routeNode: Node = {
          id: `route:${filePath}:${line}:${method}:${routePath}`,
          kind: 'route',
          name,
          qualifiedName: `${filePath}::route:${method}:${routePath}`,
          filePath,
          startLine: line,
          endLine: line,
          startColumn: 0,
          endColumn: hit.end - hit.index,
          language: 'python',
          updatedAt: now,
        };
        nodes.push(routeNode);
        if (hit.handler) {
          references.push({
            fromNodeId: routeNode.id,
            referenceName: hit.handler,
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

function collectRouteHits(safe: string): RouteHit[] {
  const hits: RouteHit[] = [];
  const seen = new Set<string>();

  // @route(...) or @app.route(...) — optional receiver.
  const routeDec = /@(\w+\.)?route\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = routeDec.exec(safe)) !== null) {
    const argsStart = m.index + m[0].length;
    const argsEnd = findMatchingParen(safe, argsStart - 1);
    if (argsEnd < 0) continue;
    const args = safe.slice(argsStart, argsEnd);
    const paths = parsePaths(args);
    if (paths.length === 0) continue; // path=None auto-gen — skip
    const methods = parseMethods(args) ?? ['GET'];
    const end = argsEnd + 1;
    const callback = parseCallbackArg(args);
    const handler = callback ?? findHandlerAfter(safe, end);
    pushHit(hits, seen, {
      index: m.index,
      end,
      methods,
      paths,
      handler,
    });
    routeDec.lastIndex = end;
  }

  // @get/@post/... or @app.get/...
  const shorthand = new RegExp(
    `@(\\w+\\.)?(${SHORTHAND_METHODS.join('|')})\\s*\\(`,
    'g'
  );
  while ((m = shorthand.exec(safe)) !== null) {
    const method = m[2]!.toUpperCase();
    const argsStart = m.index + m[0].length;
    const argsEnd = findMatchingParen(safe, argsStart - 1);
    if (argsEnd < 0) continue;
    const args = safe.slice(argsStart, argsEnd);
    const paths = parsePaths(args);
    if (paths.length === 0) continue;
    const end = argsEnd + 1;
    const callback = parseCallbackArg(args);
    const handler = callback ?? findHandlerAfter(safe, end);
    pushHit(hits, seen, {
      index: m.index,
      end,
      methods: [method],
      paths,
      handler,
    });
    shorthand.lastIndex = end;
  }

  // Non-decorator: route(..., callback=fn) / app.route(..., callback=fn)
  // Only when callback= is present — otherwise it's the decorator form already handled.
  const progRoute = /\b(?:(\w+)\.)?route\s*\(/g;
  while ((m = progRoute.exec(safe)) !== null) {
    // Skip if this is a decorator (@route) — already handled above.
    const before = safe.slice(Math.max(0, m.index - 2), m.index);
    if (before.includes('@')) continue;

    const argsStart = m.index + m[0].length;
    const argsEnd = findMatchingParen(safe, argsStart - 1);
    if (argsEnd < 0) continue;
    const args = safe.slice(argsStart, argsEnd);
    const callback = parseCallbackArg(args);
    if (!callback) continue;
    const paths = parsePaths(args);
    if (paths.length === 0) continue;
    const methods = parseMethods(args) ?? ['GET'];
    pushHit(hits, seen, {
      index: m.index,
      end: argsEnd + 1,
      methods,
      paths,
      handler: callback,
    });
    progRoute.lastIndex = argsEnd + 1;
  }

  return hits;
}

function pushHit(hits: RouteHit[], seen: Set<string>, hit: RouteHit): void {
  const key = `${hit.index}:${hit.methods.join(',')}:${hit.paths.join(',')}`;
  if (seen.has(key)) return;
  seen.add(key);
  hits.push(hit);
}

function parsePaths(args: string): string[] {
  // First positional string, or a list/tuple of strings as the first arg.
  const trimmed = args.trim();
  if (!trimmed) return [];

  // List/tuple of paths: ['/a', '/b'] or ("/a", "/b")
  const listMatch = trimmed.match(/^[\[(]\s*((?:['"][^'"]*['"]\s*,?\s*)+)[\])]/);
  if (listMatch) {
    return (listMatch[1]!.match(/['"]([^'"]*)['"]/g) || []).map((s) => s.slice(1, -1));
  }

  // Keyword path=...
  const kw = args.match(/\bpath\s*=\s*(['"])([^'"]*)\1/);
  if (kw) return [kw[2]!];

  // First positional string literal.
  const pos = trimmed.match(/^(['"])([^'"]*)\1/);
  if (pos) return [pos[2]!];

  return [];
}

function parseMethods(args: string): string[] | null {
  // method='POST' / method = "GET"
  const single = args.match(/\bmethod\s*=\s*(['"])([A-Za-z]+)\1/);
  if (single) return [single[2]!.toUpperCase()];

  // method=['GET', 'POST'] or method=("GET", "POST")
  const list = args.match(/\bmethod\s*=\s*[\[(]([^\])]+)[\])]/);
  if (list) {
    const methods = (list[1]!.match(/['"]([A-Za-z]+)['"]/g) || []).map((s) =>
      s.slice(1, -1).toUpperCase()
    );
    return methods.length ? methods : null;
  }

  return null;
}

function parseCallbackArg(args: string): string | null {
  const m = args.match(/\bcallback\s*=\s*([A-Za-z_]\w*)/);
  return m?.[1] ?? null;
}

function findHandlerAfter(safe: string, from: number): string | null {
  const tail = safe.slice(from);
  // Allow intervening decorators (@view, @login_required, …) before def.
  const m = tail.match(/^(?:\s*(?:@[^\n]+|\n))*\s*(?:async\s+)?def\s+(\w+)/);
  return m?.[1] ?? null;
}

/**
 * Bottle wildcards: <name>, <name:int|float|path|re:…> → {name}
 * Legacy: :name → {name}
 */
function normalizePathParams(path: string): string {
  let out = path.replace(/<([A-Za-z_]\w*)(?::[^>]*)?>/g, '{$1}');
  out = out.replace(/:([A-Za-z_]\w*)/g, '{$1}');
  return out || '/';
}

function findMatchingParen(src: string, openIdx: number): number {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i]!;
    if (inStr) {
      if (ch === '\\' && inStr !== "'''" && inStr !== '"""') {
        i++;
        continue;
      }
      if (ch === inStr[0] && src.slice(i, i + inStr.length) === inStr) {
        i += inStr.length - 1;
        inStr = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      if (src.slice(i, i + 3) === '"""' || src.slice(i, i + 3) === "'''") {
        inStr = src.slice(i, i + 3);
        i += 2;
      } else {
        inStr = ch;
      }
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function lineAt(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}
