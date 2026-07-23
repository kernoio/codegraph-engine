/**
 * Tornado HTTP route discovery (Kerno in-repo plugin)
 *
 * Covers `tornado.web.Application` URLSpec tables — tuple form
 * `(r'/path', Handler)`, `url(...)` / `URLSpec(...)`, and optional kwargs —
 * plus best-effort verb inference from RequestHandler method defs in the
 * same file.
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

const HTTP_VERBS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
const HANDLER_DIRS = ['handler', 'handlers', 'web', 'app', 'routes', 'views'];

export const tornadoResolver: FrameworkResolver = {
  name: 'tornado',
  languages: ['python'],

  detect(context: ResolutionContext): boolean {
    for (const f of ['requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py', 'setup.cfg']) {
      const c = context.readFile(f);
      if (c && /\btornado\b/i.test(c)) return true;
    }

    // Content scan: Application / URLSpec usage (bounded).
    const files = context
      .getAllFiles()
      .filter((f) => f.endsWith('.py'))
      .slice(0, 80);
    for (const f of files) {
      const c = context.readFile(f);
      if (!c) continue;
      if (
        /\btornado\.web\.(?:Application|URLSpec|url)\b/.test(c) ||
        /\bfrom\s+tornado(?:\.web)?\s+import\b/.test(c) ||
        /\bimport\s+tornado(?:\.web)?\b/.test(c)
      ) {
        if (
          /\bApplication\s*\(/.test(c) ||
          /\bURLSpec\s*\(/.test(c) ||
          /\burl\s*\(\s*r?['"]\//.test(c)
        ) {
          return true;
        }
      }
    }
    return false;
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    if (!/^[A-Z][A-Za-z0-9_]*$/.test(ref.referenceName)) return null;
    const target = resolveHandlerClass(ref.referenceName, context);
    if (!target) return null;
    return {
      original: ref,
      targetNodeId: target,
      confidence: 0.85,
      resolvedBy: 'framework',
    };
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!filePath.endsWith('.py')) return { nodes: [], references: [] };

    const safe = stripCommentsForRegex(content, 'python');
    const nodes: Node[] = [];
    const references: UnresolvedRef[] = [];
    const now = Date.now();
    const verbsByClass = collectHandlerVerbs(safe);
    const seen = new Set<string>();

    const emit = (rawPath: string, handlerExpr: string, index: number, matchLen: number) => {
      const handlerName = handlerExpr.split('.').pop()!;
      if (!isHandlerClassName(handlerName)) return;

      const routePath = normalizeTornadoPath(rawPath);
      if (routePath === null) return;

      const verbs = verbsByClass.get(handlerName) ?? ['GET'];
      const line = lineAt(safe, index);

      for (const verb of verbs) {
        const key = `${verb} ${routePath}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const routeNode: Node = {
          id: `route:${filePath}:${line}:${verb}:${routePath}`,
          kind: 'route',
          name: key,
          qualifiedName: `${filePath}::route:${verb}:${routePath}`,
          filePath,
          startLine: line,
          endLine: line,
          startColumn: 0,
          endColumn: matchLen,
          language: 'python',
          updatedAt: now,
        };
        nodes.push(routeNode);
        references.push({
          fromNodeId: routeNode.id,
          referenceName: handlerName,
          referenceKind: 'references',
          line,
          column: 0,
          filePath,
          language: 'python',
        });
      }
    };

    // url(r'/path', Handler) / URLSpec(r'/path', Handler) / tornado.web.url(...)
    const urlSpecRe =
      /\b(?:tornado\.web\.)?(?:url|URLSpec)\s*\(\s*r?['"]([^'"]+)['"]\s*,\s*([A-Za-z_][\w.]*)/g;
    let match: RegExpExecArray | null;
    while ((match = urlSpecRe.exec(safe)) !== null) {
      emit(match[1]!, match[2]!, match.index, match[0].length);
    }

    // Tuple form: (r'/path', Handler) or ('/path', Handler[, kwargs])
    // Require Handler/Handlers suffix so bare 2-tuples don't pollute non-route files.
    const tupleRe =
      /\(\s*r?['"]([^'"]+)['"]\s*,\s*([A-Za-z_][\w.]*(?:Handler|Handlers))\b/g;
    while ((match = tupleRe.exec(safe)) !== null) {
      emit(match[1]!, match[2]!, match.index, match[0].length);
    }

    return { nodes, references };
  },
};

function isHandlerClassName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9_]*$/.test(name);
}

/**
 * Normalize a Tornado regex path to a readable `/path/{param}` form.
 * Returns null for patterns that are not HTTP paths (avoids false positives).
 */
export function normalizeTornadoPath(raw: string): string | null {
  let p = raw.trim();
  if (!p) return null;

  // Catch-all / not-found style — keep a single wildcard route.
  if (p === '.*' || p === '.+' || p === '^.*$' || p === '^.+$') return '/*';

  p = p.replace(/^\^/, '').replace(/\$$/, '');

  // Must look like a URL path (Tornado apps almost always start with /).
  if (!p.startsWith('/') && p !== '') return null;

  // Named groups → {name}
  p = p.replace(/\(\?P<(\w+)>[^)]*\)/g, '{$1}');

  // Drop non-capturing optional segments: (?:foo)? / (thumbnail)?
  p = p.replace(/\(\?:[^)]*\)\?/g, '');
  p = p.replace(/\([^)]*\)\?/g, '');

  // Alternation groups (shield|block|delete) → {param}
  let paramIdx = 0;
  p = p.replace(/\(([^)]+)\)/g, (_m, inner: string) => {
    if (inner.includes('|')) {
      paramIdx += 1;
      return `{param${paramIdx === 1 ? '' : paramIdx}}`;
    }
    // Typical capture: ([0-9]+), (\w+), (.*), ([a-f0-9]{24})
    paramIdx += 1;
    return `{param${paramIdx === 1 ? '' : paramIdx}}`;
  });

  // Trailing optional slash: /login/? → /login
  p = p.replace(/\/\?$/g, '');
  // Stray regex quantifiers left on slashes
  p = p.replace(/\/\?/g, '/');
  // Collapse duplicate slashes
  p = p.replace(/\/{2,}/g, '/');
  // Remove empty optional leftovers
  p = p.replace(/\(\?:\)/g, '');

  if (p === '') p = '/';
  if (!p.startsWith('/')) return null;

  // Reject leftover heavy regex that we failed to normalize
  if (/[\\^$+[\]|]/.test(p)) return null;

  return p;
}

/** Map RequestHandler subclass name → HTTP verbs defined in this file. */
export function collectHandlerVerbs(safe: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const classRe = /\bclass\s+([A-Z][A-Za-z0-9_]*)\s*(?:\([^)]*\))?\s*:/g;
  let m: RegExpExecArray | null;
  const starts: { name: string; index: number }[] = [];
  while ((m = classRe.exec(safe)) !== null) {
    starts.push({ name: m[1]!, index: m.index });
  }

  for (let i = 0; i < starts.length; i++) {
    const { name, index } = starts[i]!;
    const end = i + 1 < starts.length ? starts[i + 1]!.index : safe.length;
    const body = safe.slice(index, end);
    const verbs: string[] = [];
    for (const v of HTTP_VERBS) {
      if (new RegExp(`\\b(?:async\\s+)?def\\s+${v}\\s*\\(`).test(body)) {
        verbs.push(v.toUpperCase());
      }
    }
    if (verbs.length > 0) map.set(name, verbs);
  }
  return map;
}

function resolveHandlerClass(name: string, context: ResolutionContext): string | null {
  const candidates = context.getNodesByName(name).filter((n) => n.kind === 'class');
  if (candidates.length === 0) return null;
  const preferred = candidates.filter((n) =>
    HANDLER_DIRS.some((d) => n.filePath.includes(`/${d}/`) || n.filePath.includes(`/${d}.`))
  );
  return (preferred[0] ?? candidates[0])!.id;
}

function lineAt(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}
